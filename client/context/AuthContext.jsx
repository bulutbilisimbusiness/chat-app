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
				path: "/socket.io",
				reconnection: true,
				reconnectionAttempts: Infinity,
				reconnectionDelay: 1000,
				reconnectionDelayMax: 5000,
				timeout: 20000,
				forceNew: true,
				withCredentials: true,
			});

			newSocket.on("connect", () => {
				console.log("Socket connected successfully");
				newSocket.emit("getOnlineUsers");
			});

			newSocket.on("connect_error", (error) => {
				console.error("Socket.IO Connection Error:", error.message);
			});

			newSocket.on("disconnect", (reason) => {
				console.log("Socket disconnected:", reason);
			});

			newSocket.on("onlineUsers", (users) => {
				console.log("Online users received:", users);
				if (Array.isArray(users)) {
					setOnlineUsers(users);
				}
			});

			setSocket(newSocket);

			return () => {
				if (newSocket) {
					newSocket.disconnect();
				}
			};
		} catch (error) {
			console.error("Socket initialization error:", error);
		}
	};

	useEffect(() => {
		if (token) {
			axios.defaults.headers.common["token"] = token;
			checkAuth();
		}

		return () => {
			if (socket) {
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
