global.userSockets = global.userSockets || new Map();

import { Server as SocketIOServer } from 'socket.io';
import Chat from '../schemas/chat.schema.js';
import mongoose from 'mongoose';
import Product from '../schemas/product.schema.js';
import User from '../schemas/user.schema.js';
import { approveRequirementOnChatStart } from '../controllers/requirement.controller.js';

export default function chatHandler(server) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: ['http://localhost:5173','https://kaleidoscopic-pika-c2b489.netlify.app','https://saralbuy.com'],
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
  });

  global.io = io;
  const userSockets = global.userSockets;

  // Helper function to generate consistent room IDs
  const generateRoomId = (productId, buyerId, sellerId) => {
    const sortedIds = [buyerId, sellerId].sort();
    return `product_${productId}_buyer_${sortedIds[0]}_seller_${sortedIds[1]}`;
  };

  // Helper function to determine buyerId
  const determineBuyerId = (data, socket) => {
    const { userId, userType, buyerId } = data;
    if (userType === 'buyer') {
      return userId;
    }
    return buyerId || socket.buyerId || userId;
  };

  // Helper function to send notification to users not in room

const sendNotificationToOfflineUser = (notifyUserId, roomId, payload) => {
  const recipientSockets = userSockets.get(String(notifyUserId));
  if (recipientSockets) {
    for (const sockId of recipientSockets) {
      const recipientSocket = io.sockets.sockets.get(sockId);
      // Send notification even if user is in other rooms, but not in this specific room
      if (recipientSocket && !recipientSocket.rooms.has(roomId)) {
        recipientSocket.emit('new_message_notification', payload);
        console.log(`Notification sent to user ${notifyUserId} for room ${roomId}`);
      }
    }
  }
};

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Listen for user identification
    socket.on('identify', ({ userId }) => {
      if (!userId) return;
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      socket.userId = userId;
      console.log(`User identified: ${userId} with socket ${socket.id}`);
    });

    // Handle joining a chat room
    socket.on('join_room', async (data) => {
      const { userId, productId, sellerId, userType } = data;

      // Validate required fields
      if (!userId || !productId || !sellerId || !userType) {
        socket.emit('error', { message: 'Missing required fields: userId, productId, sellerId, or userType' });
        return;
      }

      // Determine buyerId based on userType
      const buyerId = determineBuyerId(data, socket);

      // Prevent same user from being both buyer and seller
      if (String(buyerId) === String(sellerId)) {
        socket.emit('error', { message: 'Cannot create chat with yourself. Buyer and seller must be different users.' });
        console.log(`Rejected chat creation: buyerId ${buyerId} and sellerId ${sellerId} are the same`);
        return;
      }

      // Leave previous room if exists
      if (socket.roomId) {
        socket.leave(socket.roomId);
        socket.to(socket.roomId).emit('user_left', {
          userId: socket.userId,
          userType: socket.userType,
          message: `${socket.userType} has left the chat`
        });
        console.log(`User ${socket.userId} left previous room ${socket.roomId}`);
      }

      // Create consistent room ID
      const roomId = generateRoomId(productId, buyerId, sellerId);

      // Join the room
      socket.join(roomId);

      // Store user information in socket session
      socket.userId = userId;
      socket.productId = productId;
      socket.sellerId = sellerId;
      socket.buyerId = buyerId;
      socket.userType = userType;
      socket.roomId = roomId;

      console.log(`User ${userId} (${userType}) joined room ${roomId} for product ${productId}`);
      console.log(`Room participants - Buyer: ${buyerId}, Seller: ${sellerId}`);

      // Notify others in the room that a user has joined
      socket.to(roomId).emit('user_joined', {
        userId,
        userType,
        message: `${userType} has joined the chat`
      });

      // Confirm room joining to the user
      socket.emit('room_joined', {
        roomId,
        buyerId,
        sellerId,
        message: `You have joined the chat for product ${productId}`
      });

      // Reset unread count for the joining user and send chat history
      // Reset unread count for the joining user and send chat history
try {
  const updateField = userType === 'buyer' ? { buyerUnreadCount: 0 } : { sellerUnreadCount: 0 };
  const chat = await Chat.findOneAndUpdate(
    { roomId },
    { $set: updateField },
    { new: true }
  ).lean();

  const messages = chat?.messages || [];
  const lastMessage = chat?.lastMessage || (messages.length > 0 ? messages[messages.length - 1] : null);

  socket.emit('chat_history', {
    roomId,
    messages,
    lastMessage,
    messageCount: messages.length,
    buyerUnreadCount: chat?.buyerUnreadCount || 0,
    sellerUnreadCount: chat?.sellerUnreadCount || 0
  });

  // Also update everyone in the room about the new unread counts
  io.to(roomId).emit('chat_last_message_update', {
    roomId,
    lastMessage,
    buyerUnreadCount: chat?.buyerUnreadCount || 0,
    sellerUnreadCount: chat?.sellerUnreadCount || 0
  });
} catch (err) {
  console.error('Error fetching chat history on join:', err);
  socket.emit('error', { message: 'Failed to fetch chat history', error: err.message });
}

      // Approve requirement if this is the product owner (buyer) joining chat for the first time
      approveRequirementOnChatStart({ productId, userId, sellerId })
        .then(result => {
          if (result.updated) {
            console.log(`Requirement approved for product ${productId} and user ${userId} (seller: ${sellerId})`);
          } else {
            console.log(`Requirement not approved: ${result.reason}`);
          }
        })
        .catch(err => {
          console.error("Error approving requirement on chat start:", err);
        });
    });

    // Fetch chat history when joining a room
    socket.on('get_chat_history', async (data) => {
      const { productId, sellerId, buyerId } = data;

      if (!productId || !sellerId || !buyerId) {
        socket.emit('error', { message: 'Missing required fields for fetching chat history' });
        return;
      }

      // Prevent fetching chat history if buyer and seller are the same
      if (String(buyerId) === String(sellerId)) {
        socket.emit('error', { message: 'Cannot fetch chat history. Buyer and seller cannot be the same user.' });
        console.log(`Rejected chat history fetch: buyerId ${buyerId} and sellerId ${sellerId} are the same`);
        return;
      }

      const roomId = generateRoomId(productId, buyerId, sellerId);

      try {
        const chat = await Chat.findOne({ roomId }).lean();
        const messages = chat?.messages || [];
        const lastMessage = chat?.lastMessage || (messages.length > 0 ? messages[messages.length - 1] : null);

        console.log(lastMessage, "lastMessage");

        socket.emit('chat_history', {
          roomId,
          messages,
          lastMessage,
          messageCount: messages.length,
          buyerUnreadCount: chat?.buyerUnreadCount || 0,
          sellerUnreadCount: chat?.sellerUnreadCount || 0
        });
      } catch (err) {
        console.error('Error fetching chat history:', err);
        socket.emit('error', { message: 'Failed to fetch chat history', error: err.message });
      }
    });

    // Handle sending messages
    // Handle sending messages
socket.on('send_message', async (data) => {
  const { productId, sellerId, message, senderId, senderType, buyerId } = data;

  // Validate required fields
  if (!productId || !sellerId || !message || !senderId || !senderType) {
    socket.emit('error', { message: 'Missing required fields for sending message' });
    return;
  }

  // Determine final buyerId
  const finalBuyerId = determineBuyerId({ userId: senderId, userType: senderType, buyerId }, socket);

  if (!finalBuyerId) {
    socket.emit('error', { message: 'Cannot determine buyerId for room' });
    return;
  }

  // Prevent sending messages if buyer and seller are the same
  if (String(finalBuyerId) === String(sellerId)) {
    socket.emit('error', { message: 'Cannot send message to yourself. Buyer and seller must be different users.' });
    console.log(`Rejected message: buyerId ${finalBuyerId} and sellerId ${sellerId} are the same`);
    return;
  }

  const roomId = generateRoomId(productId, finalBuyerId, sellerId);

  // Check if recipient is in the room
  const recipientId = senderType === 'buyer' ? sellerId : finalBuyerId;
  let isRecipientInRoom = false;

  // Check if recipient has any sockets in this room
  const recipientSockets = userSockets.get(String(recipientId));
  if (recipientSockets) {
    for (const sockId of recipientSockets) {
      const recipientSocket = io.sockets.sockets.get(sockId);
      if (recipientSocket && recipientSocket.rooms.has(roomId)) {
        isRecipientInRoom = true;
        break;
      }
    }
  }

  // Save message to DB and update unread count only if recipient is not in room
  try {
    const msgObj = {
      senderId: new mongoose.Types.ObjectId(senderId),
      senderType,
      message,
      timestamp: new Date()
    };

    // Only increment unread count if recipient is NOT in the room
    // Determine which unread count to increment
    let unreadField;
    if (senderType === 'buyer') {
      unreadField = 'sellerUnreadCount';
    } else if (senderType === 'seller') {
      unreadField = 'buyerUnreadCount';
    } else {
      console.warn('Unknown senderType:', senderType);
      unreadField = null;
    }
    console.log(`[DEBUG] senderType: ${senderType}, incrementing unreadField: ${unreadField}`);

    const updateOperations = {
      $setOnInsert: {
        productId: new mongoose.Types.ObjectId(productId),
        buyerId: new mongoose.Types.ObjectId(finalBuyerId),
        sellerId: new mongoose.Types.ObjectId(sellerId),
        roomId
      },
      $push: { messages: msgObj },
      $set: { lastMessage: msgObj }
    };

    // Only increment unread count if recipient is not in the room
    // Always increment unread count for the recipient (unless sender is recipient, which is prevented above)
    updateOperations.$inc = { [unreadField]: 1 };

    const chat = await Chat.findOneAndUpdate(
      { roomId },
      updateOperations,
      { upsert: true, new: true }
    ).lean();

    // Broadcast the message to everyone in the room
    io.to(roomId).emit('receive_message', {
      productId,
      message,
      senderId,
      senderType,
      timestamp: msgObj.timestamp,
      roomId,
      lastMessage: chat?.lastMessage || msgObj,
      messageCount: chat?.messages?.length || 0,
      buyerUnreadCount: chat?.buyerUnreadCount || 0,
      sellerUnreadCount: chat?.sellerUnreadCount || 0
    });

    // Emit last message update for sidebar/chat list
    io.to(roomId).emit('chat_last_message_update', {
      roomId,
      lastMessage: chat?.lastMessage || msgObj,
      buyerUnreadCount: chat?.buyerUnreadCount || 0,
      sellerUnreadCount: chat?.sellerUnreadCount || 0
    });

    // --- Notification logic for users not in the room ---
    if (!isRecipientInRoom) {
      sendNotificationToOfflineUser(recipientId, roomId, {
        roomId,
        lastMessage: chat?.lastMessage || msgObj,
        productId,
        sellerId,
        buyerId: finalBuyerId,
        buyerUnreadCount: chat?.buyerUnreadCount || 0,
        sellerUnreadCount: chat?.sellerUnreadCount || 0
      });
    }

    console.log(`Message sent in room ${roomId} by ${senderId} (${senderType}): "${message}"`);
    console.log(`Unread counts - Buyer: ${chat?.buyerUnreadCount || 0}, Seller: ${chat?.sellerUnreadCount || 0}`);
  // --- Emit recent_chat_update to all sockets of recipient and sender ---
  try {
    // Prepare recent chat summary
    const recentChatSummary = {
      roomId,
      productId,
      buyerId: finalBuyerId,
      sellerId,
      lastMessage: chat?.lastMessage || msgObj,
      messageCount: chat?.messages?.length || 0,
      buyerUnreadCount: chat?.buyerUnreadCount || 0,
      sellerUnreadCount: chat?.sellerUnreadCount || 0,
    };

    // Emit to all recipient sockets
    if (recipientSockets) {
      for (const sockId of recipientSockets) {
        const recipientSocket = io.sockets.sockets.get(sockId);
        if (recipientSocket) {
          recipientSocket.emit('recent_chat_update', recentChatSummary);
        }
      }
    }

    // Emit to all sender sockets (so their recent chat list also updates)
    const senderSockets = userSockets.get(String(senderId));
    if (senderSockets) {
      for (const sockId of senderSockets) {
        const senderSocket = io.sockets.sockets.get(sockId);
        if (senderSocket) {
          senderSocket.emit('recent_chat_update', recentChatSummary);
        }
      }
    }
  } catch (emitErr) {
    console.error('Error emitting recent_chat_update:', emitErr);
  }
} catch (err) {
  console.error('Error saving message:', err);
  socket.emit('error', { message: 'Failed to save message', error: err.message });
}
});

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { productId, userId, sellerId, buyerId } = data;
      if (!productId || !userId || !sellerId) return;

      const finalBuyerId = determineBuyerId({ userId, userType: socket.userType, buyerId }, socket);
      if (!finalBuyerId) return;

      // Prevent typing indicator if buyer and seller are the same
      if (String(finalBuyerId) === String(sellerId)) return;

      const roomId = generateRoomId(productId, finalBuyerId, sellerId);

      socket.to(roomId).emit('user_typing', {
        userId,
        isTyping: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { productId, userId, sellerId, buyerId } = data;
      if (!productId || !userId || !sellerId) return;

      const finalBuyerId = determineBuyerId({ userId, userType: socket.userType, buyerId }, socket);
      if (!finalBuyerId) return;

      // Prevent typing indicator if buyer and seller are the same
      if (String(finalBuyerId) === String(sellerId)) return;

      const roomId = generateRoomId(productId, finalBuyerId, sellerId);

      socket.to(roomId).emit('user_typing', {
        userId,
        isTyping: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { productId, userId, sellerId, buyerId } = data;
      if (!productId || !userId || !sellerId) return;

      const finalBuyerId = determineBuyerId({ userId, userType: socket.userType, buyerId }, socket);
      if (!finalBuyerId) return;

      const roomId = generateRoomId(productId, finalBuyerId, sellerId);

      socket.to(roomId).emit('user_typing', {
        userId,
        isTyping: false
      });
    });

    // Real-time product notification event
    socket.on('send_product_notification', (data) => {
      const { userId, productId, title, description } = data;
      if (!userId || !productId || !title || !description) return;

      const recipientSockets = userSockets.get(String(userId));
      if (recipientSockets) {
        for (const sockId of recipientSockets) {
          const recipientSocket = io.sockets.sockets.get(sockId);
          if (recipientSocket) {
            recipientSocket.emit('product_notification', {
              productId,
              title,
              description
            });
          }
        }
      }
    });

    // Get all recent chats for a user
    socket.on('get_recent_chats', async (data) => {
      const { userId } = data;
      if (!userId) {
        socket.emit('error', { message: 'Missing userId for fetching recent chats' });
        return;
      }

      try {
        // Find all chats where the user is either buyer or seller
        const chats = await Chat.find({
          $or: [
            { buyerId: new mongoose.Types.ObjectId(userId) },
            { sellerId: new mongoose.Types.ObjectId(userId) }
          ]
        }).lean();

        // Gather all unique productIds, buyerIds, sellerIds
        const productIds = [...new Set(chats.map(chat => String(chat.productId)))];
        const buyerIds = [...new Set(chats.map(chat => String(chat.buyerId)))];
        const sellerIds = [...new Set(chats.map(chat => String(chat.sellerId)))];

        // Fetch all products and users in one go
        const [products, users] = await Promise.all([
          Product.find({ _id: { $in: productIds } }).lean(),
          User.find({ _id: { $in: [...buyerIds, ...sellerIds] } }).lean()
        ]);

        // Create lookup maps for quick access
        const productMap = {};
        products.forEach(prod => { productMap[String(prod._id)] = prod; });

        const userMap = {};
        users.forEach(u => { userMap[String(u._id)] = u; });

        // Map to desired response format with populated details and userType
        const recentChats = chats
          .filter(chat => String(chat.buyerId) !== String(chat.sellerId)) // Exclude chats where buyer and seller are the same user
          .map(chat => {
            let userType = null;
            if (String(chat.buyerId) === String(userId)) {
              userType = 'buyer';
            } else if (String(chat.sellerId) === String(userId)) {
              userType = 'seller';
            }
            return {
              roomId: chat.roomId,
              product: productMap[String(chat.productId)] || null,
              buyer: userMap[String(chat.buyerId)] || null,
              seller: userMap[String(chat.sellerId)] || null,
              messages: chat.messages || [],
              lastMessage: chat.lastMessage || (chat.messages?.length > 0 ? chat.messages[chat.messages.length - 1] : null),
              messageCount: chat.messages?.length || 0,
              buyerUnreadCount: chat.buyerUnreadCount || 0,
              sellerUnreadCount: chat.sellerUnreadCount || 0,
              userType
            };
          });

        socket.emit('recent_chats', { chats: recentChats });
      } catch (err) {
        console.error('Error fetching recent chats:', err);
        socket.emit('error', { message: 'Failed to fetch recent chats', error: err.message });
      }
    });

    // Handle clearing/leaving active room
    socket.on('leave_room', (data) => {
      const { roomId } = data;
      const targetRoomId = roomId || socket.roomId;

      if (!targetRoomId) {
        socket.emit('error', { message: 'No active room to leave' });
        return;
      }

      // Leave the room
      socket.leave(targetRoomId);

      // Notify others in the room
      socket.to(targetRoomId).emit('user_left', {
        userId: socket.userId,
        userType: socket.userType,
        message: `${socket.userType} has left the chat`
      });

      console.log(`User ${socket.userId} left room ${targetRoomId}`);

      // Clear room data from socket
      socket.roomId = null;
      socket.productId = null;
      socket.sellerId = null;
      socket.buyerId = null;
      socket.userType = null;

      // Confirm to the user
      socket.emit('room_left', {
        roomId: targetRoomId,
        message: 'You have left the chat room'
      });
    });

    // Handle user disconnects
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);

      // Clean up user socket mapping
      if (socket.userId && userSockets.has(socket.userId)) {
        userSockets.get(socket.userId).delete(socket.id);
        if (userSockets.get(socket.userId).size === 0) {
          userSockets.delete(socket.userId);
        }
      }

      // If the socket was in a room, notify others that the user left
      if (socket.roomId) {
        socket.to(socket.roomId).emit('user_left', {
          userId: socket.userId,
          userType: socket.userType,
          message: `${socket.userType} has left the chat`
        });
      }
    });
  });

  return io;
}