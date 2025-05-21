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
				? [
						"https://chat-app-frontend-five-olive.vercel.app",
						"https://chat-app-backend-two-tau.vercel.app",
				  ]
				: "http://localhost:5173",
		methods: ["GET", "POST"],
		credentials: true,
	},
	transports: ["websocket", "polling"],
	pingTimeout: 60000,
	pingInterval: 25000,
});

// Online users tracking
const userSocketMap = {};

io.on("connection", (socket) => {
	const userId = socket.handshake.query.userId;
	if (userId) {
		console.log(`User connected: ${userId}`);
		userSocketMap[userId] = socket.id;
		io.emit("getOnlineUsers", Object.keys(userSocketMap));

		socket.on("sendMessage", ({ message, receiverId }) => {
			const receiverSocketId = userSocketMap[receiverId];
			if (receiverSocketId) {
				io.to(receiverSocketId).emit("messageReceived", message);
			}
		});

		socket.on("disconnect", () => {
			console.log(`User disconnected: ${userId}`);
			delete userSocketMap[userId];
			io.emit("getOnlineUsers", Object.keys(userSocketMap));
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
