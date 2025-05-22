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
	path: "/socket.io/",
	transports: ["polling", "websocket"],
	allowEIO3: true,
	pingTimeout: 10000,
	pingInterval: 5000,
});

// Online users tracking
const userSocketMap = {};

// Middleware to handle authentication
io.use((socket, next) => {
	const userId = socket.handshake.query.userId;
	if (!userId) {
		return next(new Error("Authentication error"));
	}
	socket.userId = userId;
	next();
});

io.on("connection", (socket) => {
	const userId = socket.userId;
	console.log(`User connected: ${userId}`);

	// Add user to online users
	userSocketMap[userId] = socket.id;

	// Broadcast to all clients that a new user is online
	io.emit("onlineUsers", Object.keys(userSocketMap));

	// Handle ping request
	socket.on("ping", () => {
		socket.emit("pong");
	});

	socket.on("getOnlineUsers", () => {
		socket.emit("onlineUsers", Object.keys(userSocketMap));
	});

	socket.on("sendMessage", ({ message, receiverId }) => {
		const receiverSocketId = userSocketMap[receiverId];
		if (receiverSocketId) {
			io.to(receiverSocketId).emit("messageReceived", message);
		}
	});

	socket.on("disconnect", () => {
		console.log(`User disconnected: ${userId}`);
		delete userSocketMap[userId];
		io.emit("onlineUsers", Object.keys(userSocketMap));
	});

	// Handle errors
	socket.on("error", (error) => {
		console.error(`Socket error for user ${userId}:`, error);
		delete userSocketMap[userId];
		io.emit("onlineUsers", Object.keys(userSocketMap));
	});
});

// Export for controllers
app.set("io", io);
app.set("userSocketMap", userSocketMap);

// Connect to MongoDB
connectDB().catch((err) => console.error("Database connection error:", err));

// Health check endpoint
app.get("/", (req, res) => {
	res.json({ message: "Chat App API is running" });
});

// Socket.IO health check endpoint
app.get("/socket.io-health", (req, res) => {
	res.json({ status: "ok", connections: Object.keys(userSocketMap).length });
});

app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server running on port", PORT));

export default app;
