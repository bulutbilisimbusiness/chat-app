import cors from "cors";
import "dotenv/config.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./lib/db.js";
import messageRouter from "./routes/messageRoutes.js";
import userRouter from "./routes/userRoutes.js";

// Initialize Express
const app = express();

// Configure middleware
app.use(express.json({ limit: "4mb" }));
app.use(
	cors({
		origin:
			process.env.NODE_ENV === "production"
				? [
						"https://chat-app-frontend-five-olive.vercel.app",
						"https://chat-app-backend-two-tau.vercel.app",
				  ]
				: "http://localhost:5173",
		credentials: true,
	})
);

// Create HTTP server
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
	cors: {
		origin:
			process.env.NODE_ENV === "production"
				? ["https://chat-app-frontend-five-olive.vercel.app"]
				: "http://localhost:5173",
		methods: ["GET", "POST"],
		credentials: true,
	},
	path: "/socket.io/",
	transports: ["websocket", "polling"],
	allowEIO3: true,
	pingTimeout: 60000,
	pingInterval: 25000,
	cors: {
		origin:
			process.env.NODE_ENV === "production"
				? ["https://chat-app-frontend-five-olive.vercel.app"]
				: "http://localhost:5173",
		methods: ["GET", "POST"],
		credentials: true,
	},
});

// Online users tracking
const userSocketMap = {};

io.on("connection", (socket) => {
	const userId = socket.handshake.query.userId;
	if (userId) {
		console.log(`User connected: ${userId}`);
		userSocketMap[userId] = socket.id;

		// Send initial online users list
		io.emit("onlineUsers", Object.keys(userSocketMap));

		// Handle getOnlineUsers request
		socket.on("getOnlineUsers", () => {
			socket.emit("onlineUsers", Object.keys(userSocketMap));
		});

		socket.on("sendMessage", ({ message, receiverId }) => {
			const receiverSocketId = userSocketMap[receiverId];
			if (receiverSocketId) {
				io.to(receiverSocketId).emit("messageReceived", message);
			}
		});

		// Handle disconnection
		socket.on("disconnect", (reason) => {
			console.log(`User disconnected: ${userId}, reason: ${reason}`);
			delete userSocketMap[userId];
			// Notify all clients about updated online users
			io.emit("onlineUsers", Object.keys(userSocketMap));
		});

		// Handle errors
		socket.on("error", (error) => {
			console.error(`Socket error for user ${userId}:`, error);
			delete userSocketMap[userId];
			io.emit("onlineUsers", Object.keys(userSocketMap));
		});
	}
});

// Export for controllers
app.set("io", io);
app.set("userSocketMap", userSocketMap);

// Connect to MongoDB
connectDB().catch((err) => console.error("Database connection error:", err));

// API routes
app.get("/", (req, res) => {
	res.json({ message: "Chat App API is running" });
});

app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server running on port", PORT));

export default app;
