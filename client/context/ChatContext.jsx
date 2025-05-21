import { createContext, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AuthContext } from "./AuthContext";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
	const [messages, setMessages] = useState([]);
	const [users, setUsers] = useState([]);
	const [selectedUser, setSelectedUser] = useState(null);
	const [unseenMessages, setUnseenMessages] = useState({});
	const messageListenerActive = useRef(false);

	const { socket, axios, authUser } = useContext(AuthContext);

	const getUsers = async () => {
		try {
			const { data } = await axios.get("/api/messages/users");
			if (data.success) {
				setUsers(data.users);
				setUnseenMessages(data.unseenMessages);
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

				// Yeni mesajı socket üzerinden gönder
				if (socket) {
					console.log("Sending message via socket:", newMessage);
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

	// Yeni mesaj alındığında
	const handleNewMessage = (newMessage) => {
		console.log("New message received:", newMessage);

		// Seçili kullanıcı ile mesajlaşıyorsak
		if (selectedUser && newMessage.senderId === selectedUser._id) {
			console.log("Message is from selected user, marking as seen");
			// Mesajı görüldü olarak işaretle
			newMessage.seen = true;
			// Mesajlar listesine ekle
			setMessages((prevMessages) => [...prevMessages, newMessage]);
			// Sunucuda mesajı görüldü olarak işaretle
			axios.put(`/api/messages/mark/${newMessage._id}`).catch((error) => {
				console.error("Error marking message as seen:", error);
			});
		}
		// Başka biriyle mesajlaşıyorsak veya hiç mesajlaşmıyorsak
		else {
			console.log("Message is from another user, updating unseen count");
			// Görülmemiş mesajların sayısını güncelle
			setUnseenMessages((prev) => ({
				...prev,
				[newMessage.senderId]: (prev[newMessage.senderId] || 0) + 1,
			}));

			// Yeni mesaj geldiğinde kullanıcı listesini güncelle
			getUsers();
		}
	};

	// Socket mesaj dinleme ayarları
	const setupMessageListener = () => {
		if (!socket) {
			console.log("No socket connection available");
			return;
		}

		console.log("Setting up message listeners");

		// Önceki dinleyicileri temizle
		socket.off("messageReceived");

		// Yeni mesaj dinleyicisini ekle
		socket.on("messageReceived", (newMessage) => {
			console.log("Message received via socket:", newMessage);
			handleNewMessage(newMessage);
		});

		messageListenerActive.current = true;
	};

	// Auth user değiştiğinde veya socket bağlantısı kurulduğunda/değiştiğinde kullanıcıları al
	useEffect(() => {
		if (authUser) {
			getUsers();
		}
	}, [authUser, socket]);

	// Seçili kullanıcı değiştiğinde
	useEffect(() => {
		if (selectedUser) {
			// Seçili kullanıcı ile mesajları al
			getMessages(selectedUser._id);

			// Seçili kullanıcıdan gelen okunmamış mesajları sıfırla
			setUnseenMessages((prev) => ({
				...prev,
				[selectedUser._id]: 0,
			}));
		}
	}, [selectedUser]);

	// Socket değiştiğinde mesaj dinleyiciyi ayarla
	useEffect(() => {
		if (socket && !messageListenerActive.current) {
			console.log("Setting up message listener");
			setupMessageListener();
		}

		// Component unmount olduğunda cleanup
		return () => {
			if (socket) {
				console.log("Cleaning up message listeners");
				socket.off("messageReceived");
				messageListenerActive.current = false;
			}
		};
	}, [socket]);

	const value = {
		messages,
		users,
		selectedUser,
		getUsers,
		getMessages,
		sendMessage,
		setSelectedUser,
		unseenMessages,
		setUnseenMessages,
	};
	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
