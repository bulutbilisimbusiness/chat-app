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

		// İlk bağlantıda tüm kullanıcılara online durumunu bildir
		io.emit("userStatusChanged", { userId, status: "online" });
		io.emit("getOnlineUsers", Object.keys(userSocketMap));

		// Kullanıcı açıkça bağlandığında
		socket.on("userConnected", (userId) => {
			console.log(`User explicitly connected: ${userId}`);
			userSocketMap[userId] = socket.id;
			// Tüm kullanıcılara online durumunu bildir
			io.emit("userStatusChanged", { userId, status: "online" });
			// Mevcut online kullanıcıları gönder
			io.emit("getOnlineUsers", Object.keys(userSocketMap));
		});

		// Kullanıcı online durumunu sorduğunda
		socket.on("getOnlineUsers", () => {
			console.log("Sending online users list:", Object.keys(userSocketMap));
			io.emit("getOnlineUsers", Object.keys(userSocketMap));
		});

		// Periyodik olarak bağlantı kontrolü
		const pingInterval = setInterval(() => {
			socket.emit("ping");
		}, 25000);

		socket.on("pong", () => {
			console.log(`User ${userId} is still connected`);
			// Kullanıcının bağlantısını yenile
			userSocketMap[userId] = socket.id;
			io.emit("getOnlineUsers", Object.keys(userSocketMap));
		});

		// Mesaj gönderme
		socket.on("sendMessage", ({ message, receiverId }) => {
			console.log(`Message from ${userId} to ${receiverId}:`, message);
			const receiverSocketId = userSocketMap[receiverId];
			if (receiverSocketId) {
				console.log(`Sending message to socket: ${receiverSocketId}`);
				io.to(receiverSocketId).emit("messageReceived", message);
			} else {
				console.log(`Receiver ${receiverId} is not online`);
			}
		});

		// Bağlantı koptuğunda
		socket.on("disconnect", () => {
			console.log(`User disconnected: ${userId}`);
			clearInterval(pingInterval);
			delete userSocketMap[userId];
			// Tüm kullanıcılara offline durumunu bildir
			io.emit("userStatusChanged", { userId, status: "offline" });
			// Güncel online kullanıcı listesini gönder
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
