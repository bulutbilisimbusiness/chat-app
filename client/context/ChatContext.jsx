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
				setMessages((prevMessages) => [...prevMessages, data.newMessage]);
				// Yeni mesajı socket üzerinden gönder
				if (socket) {
					socket.emit("sendMessage", {
						message: data.newMessage,
						receiverId: selectedUser._id,
					});
				}
			} else {
				toast.error(data.message);
			}
		} catch (error) {
			toast.error(error.message);
		}
	};

	// Yeni mesaj alındığında
	const handleNewMessage = (newMessage) => {
		// Seçili kullanıcı ile mesajlaşıyorsak
		if (selectedUser && newMessage.senderId === selectedUser._id) {
			// Mesajı görüldü olarak işaretle
			newMessage.seen = true;
			// Mesajlar listesine ekle
			setMessages((prevMessages) => [...prevMessages, newMessage]);
			// Sunucuda mesajı görüldü olarak işaretle
			axios.put(`/api/messages/mark/${newMessage._id}`);
		}
		// Başka biriyle mesajlaşıyorsak veya hiç mesajlaşmıyorsak
		else {
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
		if (!socket) return;

		socket.off("newMessage");
		socket.off("messageReceived");

		socket.on("messageReceived", (newMessage) => {
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
				console.log("Removing message listener");
				socket.off("newMessage");
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
