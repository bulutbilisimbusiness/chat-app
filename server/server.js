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

const app = express();
const server = http.createServer(app);

// Configure middleware first
app.use(express.json({ limit: "4mb" }));
app.use(cors());

// Set up socket.io
export const io = new Server(server, {
	cors: {
		origin: "*",
	},
});
export const userSocketMap = {};
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

// API routes
app.get("/api/status", (req, res) => res.send("Server is live"));
app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);

// Static file serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "../client/dist")));

// Catch-all route for SPA
app.get("*", (req, res) => {
	res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// Connect to database and start server
try {
	await connectDB();
	if (process.env.NODE_ENV !== "production") {
		const PORT = process.env.PORT || 5000;
		server.listen(PORT, () =>
			console.log("Server is running on PORT: " + PORT)
		);
	}
} catch (error) {
	console.error("Failed to start server:", error);
}

export default server;
