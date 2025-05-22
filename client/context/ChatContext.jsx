import { createContext, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AuthContext } from "./AuthContext";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
	const [messages, setMessages] = useState([]);
	const [users, setUsers] = useState([]);
	const [selectedUser, setSelectedUser] = useState(null);
	const [unseenMessages, setUnseenMessages] = useState({});
	const [userStatuses, setUserStatuses] = useState({}); // Online/offline durumları
	const messageListenerActive = useRef(false);
	const lastMessageTimestamp = useRef({}); // Son mesaj zamanları

	const { socket, axios, authUser, onlineUsers } = useContext(AuthContext);

	// Kullanıcı durumlarını güncelle
	const updateUserStatuses = (onlineUserIds) => {
		const newStatuses = {};
		users.forEach((user) => {
			newStatuses[user._id] = {
				online: onlineUserIds.includes(user._id),
				lastSeen: lastMessageTimestamp.current[user._id] || null,
			};
		});
		setUserStatuses(newStatuses);
	};

	const getUsers = async () => {
		try {
			const { data } = await axios.get("/api/messages/users");
			if (data.success) {
				setUsers(data.users);
				setUnseenMessages(data.unseenMessages);
				// Kullanıcı listesi güncellendiğinde online durumları da güncelle
				if (onlineUsers) {
					updateUserStatuses(onlineUsers);
				}
			}
		} catch (error) {
			toast.error(error.message);
		}
	};

	const getMessages = async (userId) => {
		try {
			const { data } = await axios.get(`/api/messages/${userId}`);
			if (data.success) {
				setMessages(data.messages);
				// Son mesaj zamanını güncelle
				if (data.messages.length > 0) {
					const lastMsg = data.messages[data.messages.length - 1];
					lastMessageTimestamp.current[userId] = lastMsg.createdAt;
				}
			}
		} catch (error) {
			toast.error(error.message);
		}
	};

	const sendMessage = async (messageData) => {
		try {
			const { data } = await axios.post(
				`/api/messages/send/${selectedUser._id}`,
				messageData
			);
			if (data.success) {
				const newMessage = data.newMessage;
				setMessages((prevMessages) => [...prevMessages, newMessage]);
				lastMessageTimestamp.current[selectedUser._id] = newMessage.createdAt;

				if (socket) {
					socket.emit("sendMessage", {
						message: newMessage,
						receiverId: selectedUser._id,
					});
				}
			} else {
				toast.error(data.message);
			}
		} catch (error) {
			console.error("Send message error:", error);
			toast.error(error.message || "Failed to send message");
		}
	};

	const handleNewMessage = (newMessage) => {
		if (selectedUser && newMessage.senderId === selectedUser._id) {
			newMessage.seen = true;
			setMessages((prevMessages) => [...prevMessages, newMessage]);
			lastMessageTimestamp.current[newMessage.senderId] = newMessage.createdAt;

			axios.put(`/api/messages/mark/${newMessage._id}`).catch((error) => {
				console.error("Error marking message as seen:", error);
			});
		} else {
			setUnseenMessages((prev) => ({
				...prev,
				[newMessage.senderId]: (prev[newMessage.senderId] || 0) + 1,
			}));
			lastMessageTimestamp.current[newMessage.senderId] = newMessage.createdAt;
			getUsers();
		}
	};

	// Socket mesaj dinleyicileri
	useEffect(() => {
		if (socket && !messageListenerActive.current) {
			socket.off("messageReceived");
			socket.on("messageReceived", handleNewMessage);
			messageListenerActive.current = true;
		}

		return () => {
			if (socket) {
				socket.off("messageReceived");
				messageListenerActive.current = false;
			}
		};
	}, [socket]);

	// Online kullanıcılar değiştiğinde durumları güncelle
	useEffect(() => {
		if (onlineUsers && users.length > 0) {
			updateUserStatuses(onlineUsers);
		}
	}, [onlineUsers, users]);

	// Auth user veya socket değiştiğinde kullanıcıları güncelle
	useEffect(() => {
		if (authUser) {
			getUsers();
		}
	}, [authUser, socket]);

	// Seçili kullanıcı değiştiğinde
	useEffect(() => {
		if (selectedUser) {
			getMessages(selectedUser._id);
			setUnseenMessages((prev) => ({
				...prev,
				[selectedUser._id]: 0,
			}));
		}
	}, [selectedUser]);

	const value = {
		messages,
		users,
		selectedUser,
		userStatuses,
		getUsers,
		getMessages,
		sendMessage,
		setSelectedUser,
		unseenMessages,
		setUnseenMessages,
	};
	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
