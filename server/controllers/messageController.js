import cloudinary from "../lib/cloudinary.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

export const getUsersForSidebar = async (req, res) => {
	try {
		const userId = req.user._id;
		const filteredUsers = await User.find({ _id: { $ne: userId } }).select(
			"-password"
		);

		const unseenMessages = {};
		const promises = filteredUsers.map(async (user) => {
			const messages = await Message.find({
				senderId: user._id,
				receiverId: userId,
				seen: false,
			});
			if (messages.length > 0) {
				unseenMessages[user._id] = messages.length;
			}
		});
		await Promise.all(promises);
		res.json({ success: true, users: filteredUsers, unseenMessages });
	} catch (error) {
		console.log(error.message);
		res.json({ success: false, message: error.message });
	}
};

export const getMessages = async (req, res) => {
	try {
		const { id: selectedUserId } = req.params;
		const myId = req.user._id;

		console.log("Getting messages between", myId, "and", selectedUserId);

		const messages = await Message.find({
			$or: [
				{ senderId: myId, receiverId: selectedUserId },
				{ senderId: selectedUserId, receiverId: myId },
			],
		}).sort({ createdAt: 1 });

		console.log("Found", messages.length, "messages");

		// Karşıdakinin mesajlarını görüldü olarak işaretle
		const updateResult = await Message.updateMany(
			{ senderId: selectedUserId, receiverId: myId, seen: false },
			{ seen: true }
		);

		console.log(
			"Marked as seen:",
			updateResult.nModified || updateResult.modifiedCount || 0,
			"messages"
		);

		// Socket.io üzerinden karşı tarafa görüldü bilgisini ilet
		const io = req.app.get("io");
		const userSocketMap = req.app.get("userSocketMap");

		if (io && userSocketMap) {
			const targetSocketId = userSocketMap[selectedUserId];
			if (targetSocketId) {
				console.log("Emitting seen notification to", selectedUserId);
				io.to(targetSocketId).emit("messagesSeen", { by: myId });
			}
		}

		res.json({ success: true, messages });
	} catch (error) {
		console.log(error.message);
		res.json({ success: false, message: error.message });
	}
};

export const markMessageAsSeen = async (req, res) => {
	try {
		const { id } = req.params;
		const updateResult = await Message.findByIdAndUpdate(id, { seen: true });
		console.log("Marked message as seen:", id);

		// Socket.io ile bilgilendir
		if (updateResult) {
			const io = req.app.get("io");
			const userSocketMap = req.app.get("userSocketMap");

			if (io && userSocketMap && updateResult.senderId) {
				const senderSocketId = userSocketMap[updateResult.senderId];
				if (senderSocketId) {
					console.log("Emitting seen notification for message");
					io.to(senderSocketId).emit("messageSeen", { messageId: id });
				}
			}
		}

		res.json({ success: true });
	} catch (error) {
		console.log(error.message);
		res.json({ success: false, message: error.message });
	}
};

export const sendMessage = async (req, res) => {
	try {
		const { text, image } = req.body;
		const receiverId = req.params.id;
		const senderId = req.user._id;
		let imageUrl;

		console.log("Sending message from", senderId, "to", receiverId);

		if (image) {
			const uploadResponse = await cloudinary.uploader.upload(image);
			imageUrl = uploadResponse.secure_url;
		}

		const newMessage = await Message.create({
			senderId,
			receiverId,
			text,
			image: imageUrl,
		});

		console.log("Created new message:", newMessage._id);

		// Get io and userSocketMap from app settings
		const io = req.app.get("io");
		const userSocketMap = req.app.get("userSocketMap");

		// Only emit socket events if io is available
		if (io && userSocketMap) {
			// Alıcıya mesajı gönder
			const receiverSocketId = userSocketMap[receiverId];
			if (receiverSocketId) {
				console.log(
					`Emitting message to receiver with socket ID: ${receiverSocketId}`
				);
				io.to(receiverSocketId).emit("newMessage", newMessage);
			} else {
				console.log("Receiver is not online - socket ID not found");
			}

			// Göndericiye de mesajı ilet (kendi sohbetini güncellemesi için)
			const senderSocketId = userSocketMap[senderId];
			if (senderSocketId && senderSocketId !== receiverSocketId) {
				console.log(
					`Emitting message back to sender with socket ID: ${senderSocketId}`
				);
				io.to(senderSocketId).emit("newMessage", newMessage);
			}
		} else {
			console.log("Socket.io or userSocketMap not available");
		}

		res.json({ success: true, newMessage });
	} catch (error) {
		console.log("Error sending message:", error.message);
		res.json({ success: false, message: error.message });
	}
};
