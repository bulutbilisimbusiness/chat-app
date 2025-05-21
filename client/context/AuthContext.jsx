import axios from "axios";
import { createContext, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

// Default to the deployed URL if environment variable is not available
const backendUrl =
	import.meta.env.VITE_BACKEND_URL ||
	(import.meta.env.DEV
		? "http://localhost:5000"
		: "https://chat-app-backend-two-tau.vercel.app");

console.log("Using backend URL:", backendUrl);
axios.defaults.baseURL = backendUrl;

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
	const [token, setToken] = useState(localStorage.getItem("token"));
	const [authUser, setAuthUser] = useState(null);
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [socket, setSocket] = useState(null);

	const checkAuth = async () => {
		try {
			const { data } = await axios.get("/api/auth/check", {
				headers: {
					token: token,
				},
			});
			if (data.success) {
				setAuthUser(data.user);
				connectSocket(data.user);
			}
		} catch (error) {
			console.error("Auth check error:", error);
			toast.error(error.message || "Authentication failed");
		}
	};

	const login = async (state, credentials) => {
		try {
			const { data } = await axios.post(`/api/auth/${state}`, credentials);
			if (data.success) {
				setAuthUser(data.userData);
				connectSocket(data.userData);
				axios.defaults.headers.common["token"] = data.token;
				setToken(data.token);
				localStorage.setItem("token", data.token);
				toast.success(data.message);
			} else {
				toast.error(data.message);
			}
		} catch (error) {
			console.error("Login error:", error);
			toast.error(error.message || "Login failed");
		}
	};

	const logout = async () => {
		if (socket) {
			socket.disconnect();
		}
		localStorage.removeItem("token");
		setToken(null);
		setAuthUser(null);
		setOnlineUsers([]);
		axios.defaults.headers.common["token"] = null;
		toast.success("Logged out successfully");
	};

	const updateProfile = async (body) => {
		try {
			const { data } = await axios.put("/api/auth/update-profile", body);
			if (data.success) {
				setAuthUser(data.user);
				toast.success("Profile updated successfully");
			}
		} catch (error) {
			console.error("Update profile error:", error);
			toast.error(error.message || "Profile update failed");
		}
	};

	const connectSocket = (userData) => {
		if (!userData || !userData._id) {
			console.log("Invalid user data, cannot connect socket");
			return;
		}

		if (socket) {
			socket.disconnect();
		}

		try {
			console.log("Connecting to socket.io server...");
			const newSocket = io(backendUrl, {
				query: { userId: userData._id },
				transports: ["websocket", "polling"],
				reconnection: true,
				reconnectionAttempts: 5,
				reconnectionDelay: 1000,
				timeout: 20000,
			});

			newSocket.on("connect", () => {
				console.log("Socket connected successfully");
				newSocket.emit("userConnected", userData._id);
				newSocket.emit("getOnlineUsers");
			});

			newSocket.on("connect_error", (error) => {
				console.error("Socket.IO Connection Error:", error.message);
				setOnlineUsers([]);
			});

			newSocket.on("disconnect", () => {
				console.log("Socket disconnected");
				setOnlineUsers([]);
			});

			newSocket.on("getOnlineUsers", (users) => {
				if (Array.isArray(users)) {
					console.log("Online users updated:", users);
					setOnlineUsers(users);
				}
			});

			newSocket.on("userStatusChanged", ({ userId, status }) => {
				console.log(`User ${userId} status changed to ${status}`);
				setOnlineUsers((prev) =>
					status === "online"
						? [...new Set([...prev, userId])]
						: prev.filter((id) => id !== userId)
				);
			});

			// Ping-pong mekanizması
			newSocket.on("ping", () => {
				console.log("Received ping from server");
				newSocket.emit("pong");
			});

			// Periyodik olarak online durumu kontrolü
			const statusCheckInterval = setInterval(() => {
				if (newSocket.connected) {
					console.log("Requesting online users update");
					newSocket.emit("getOnlineUsers");
				}
			}, 30000);

			// Socket nesnesine interval'i ekle (cleanup için)
			newSocket.statusCheckInterval = statusCheckInterval;

			setSocket(newSocket);
		} catch (error) {
			console.error("Socket initialization error:", error);
			setOnlineUsers([]);
		}
	};

	useEffect(() => {
		if (token) {
			axios.defaults.headers.common["token"] = token;
			checkAuth();
		}

		return () => {
			if (socket) {
				console.log("Cleaning up socket connection");
				clearInterval(socket.statusCheckInterval);
				socket.disconnect();
			}
		};
	}, []);

	const value = {
		axios,
		authUser,
		onlineUsers,
		socket,
		login,
		logout,
		updateProfile,
	};
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
