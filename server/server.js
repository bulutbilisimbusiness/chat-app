import cors from "cors";
import "dotenv/config.js";
import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
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
						"https://chat-app-client-five.vercel.app",
						"https://chat-app-client-erhan.vercel.app",
				  ]
				: "*",
	})
);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io (only in development)
export const io =
	process.env.NODE_ENV !== "production"
		? new Server(server, { cors: { origin: "*" } })
		: null;

export const userSocketMap = {};

// Socket.io setup (only in development)
if (io) {
	io.on("connection", (socket) => {
		const userId = socket.handshake.query.userId;
		console.log("User Connected", userId);

		if (userId) userSocketMap[userId] = socket.id;
		io.emit("getOnlineUsers", Object.keys(userSocketMap));

		socket.on("disconnect", () => {
			console.log("User Disconnected", userId);
			delete userSocketMap[userId];
			io.emit("getOnlineUsers", Object.keys(userSocketMap));
		});
	});
}

// Connect to MongoDB
connectDB().catch((err) => console.error("Database connection error:", err));

// API routes
app.get("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

// Static file serving in development
if (process.env.NODE_ENV !== "production") {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	app.use(express.static(path.join(__dirname, "../client/dist")));

	// Catch-all route for SPA in development
	app.get("*", (req, res) => {
		res.sendFile(path.join(__dirname, "../client/dist/index.html"));
	});
}

// Start server in development mode
if (process.env.NODE_ENV !== "production") {
	const PORT = process.env.PORT || 5000;
	server.listen(PORT, () => console.log("Server is running on PORT: " + PORT));
}

export default app;
