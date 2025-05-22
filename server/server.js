import cors from "cors";
import "dotenv/config.js";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { connectDB } from "./lib/db.js";
import messageRouter from "./routes/messageRoutes.js";
import userRouter from "./routes/userRoutes.js";

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
	origin:
		process.env.NODE_ENV === "production"
			? "https://chat-app-frontend-five-olive.vercel.app"
			: "http://localhost:5173",
	methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "token"],
	credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "4mb" }));

// Socket.IO setup
const io = new Server(server, {
	cors: corsOptions,
	path: "/socket.io",
	transports: ["websocket", "polling"],
	allowEIO3: true,
	pingTimeout: 60000,
	pingInterval: 25000,
	cookie: false,
	connectTimeout: 30000,
});

// Online users tracking
const userSocketMap = new Map();
const disconnectTimeouts = new Map();

// Socket.IO health check endpoint
app.get("/socket.io", (req, res) => {
	res.send({ status: "ok" });
});

io.on("connection", (socket) => {
	const userId = socket.handshake.query.userId;
	if (userId) {
		console.log(`User connected: ${userId}`);

		// Clear any existing disconnect timeout
		if (disconnectTimeouts.has(userId)) {
			clearTimeout(disconnectTimeouts.get(userId));
			disconnectTimeouts.delete(userId);
		}

		userSocketMap.set(userId, socket.id);
		io.emit("onlineUsers", Array.from(userSocketMap.keys()));

		socket.on("getOnlineUsers", () => {
			socket.emit("onlineUsers", Array.from(userSocketMap.keys()));
		});

		socket.on("sendMessage", ({ message, receiverId }) => {
			const receiverSocketId = userSocketMap.get(receiverId);
			if (receiverSocketId) {
				io.to(receiverSocketId).emit("messageReceived", message);
			}
		});

		socket.on("disconnect", (reason) => {
			console.log(`User disconnected: ${userId}, reason: ${reason}`);

			// Set a timeout before removing the user from online list
			const timeout = setTimeout(() => {
				userSocketMap.delete(userId);
				io.emit("onlineUsers", Array.from(userSocketMap.keys()));
				disconnectTimeouts.delete(userId);
			}, 10000); // 10 seconds grace period for reconnection

			disconnectTimeouts.set(userId, timeout);
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server running on port", PORT));

export default app;
