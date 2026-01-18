global.userSockets = global.userSockets || new Map();

import { Server as SocketIOServer } from 'socket.io';
import Chat from '../schemas/chat.schema.js';
import mongoose from 'mongoose';
import Product from '../schemas/product.schema.js';
import User from '../schemas/user.schema.js';
import { approveRequirementOnChatStart } from '../controllers/requirement.controller.js';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.Region,
});

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
    pingTimeout: 60000, // Set timeout for inactive sockets (60 seconds)
    pingInterval: 25000, // Interval for ping messages (25 seconds)
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
    socket.on('identify', async ({ userId }) => {
      if (!userId) return;
      
      const wasOffline = !userSockets.has(userId) || userSockets.get(userId).size === 0;
      
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      socket.userId = userId;
      console.log(`User identified: ${userId} with socket ${socket.id}`);

      // If user just came online, notify all users who have chats with them
      if (wasOffline) {
        try {
          // Find all chats where this user is a participant
          const chats = await Chat.find({
            $or: [
              { buyerId: new mongoose.Types.ObjectId(userId) },
              { sellerId: new mongoose.Types.ObjectId(userId) }
            ]
          }).select('buyerId sellerId').lean();

          // Collect all unique user IDs who have chats with this user
          const notifyUserIds = new Set();
          chats.forEach(chat => {
            const buyerIdStr = String(chat.buyerId);
            const sellerIdStr = String(chat.sellerId);
            if (buyerIdStr === userId) {
              notifyUserIds.add(sellerIdStr);
            } else {
              notifyUserIds.add(buyerIdStr);
            }
          });

          // Emit user_online event to all relevant users (notify them that this user came online)
          const onlinePayload = {
            userId,
            timestamp: new Date()
          };

          for (const notifyUserId of notifyUserIds) {
            const recipientSockets = userSockets.get(notifyUserId);
            if (recipientSockets) {
              for (const sockId of recipientSockets) {
                const recipientSocket = io.sockets.sockets.get(sockId);
                if (recipientSocket) {
                  recipientSocket.emit('user_online', onlinePayload);
                }
              }
            }
          }

          // Also notify the newly connected user about which of their chat participants are already online
          for (const chatParticipantId of notifyUserIds) {
            const isParticipantOnline = userSockets.has(chatParticipantId) && userSockets.get(chatParticipantId).size > 0;
            if (isParticipantOnline) {
              socket.emit('user_online', {
                userId: chatParticipantId,
                timestamp: new Date()
              });
            }
          }

          console.log(`User ${userId} is now online. Notified ${notifyUserIds.size} users and received status of ${Array.from(notifyUserIds).filter(id => userSockets.has(id) && userSockets.get(id).size > 0).length} online users.`);
        } catch (err) {
          console.error('Error notifying users of online status:', err);
        }
      }
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
    sellerUnreadCount: chat?.sellerUnreadCount || 0,
    chatrating: chat?.chatrating
  });

  // Also update everyone in the room about the new unread counts
  io.to(roomId).emit('chat_last_message_update', {
    roomId,
    lastMessage,
    buyerUnreadCount: chat?.buyerUnreadCount || 0,
    sellerUnreadCount: chat?.sellerUnreadCount || 0,
    chatrating: chat?.chatrating
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
          sellerUnreadCount: chat?.sellerUnreadCount || 0,
          chatrating: chat?.chatrating
        });
      } catch (err) {
        console.error('Error fetching chat history:', err);
        socket.emit('error', { message: 'Failed to fetch chat history', error: err.message });
      }
    });

    // Handle chat attachment upload
    socket.on('upload_chat_attachment', async (data) => {
      const { fileBuffer, fileName, mimeType, fileSize } = data;

      // Validate required fields
      if (!fileBuffer || !fileName || !mimeType) {
        socket.emit('upload_error', { message: 'Missing required fields: fileBuffer, fileName, or mimeType' });
        return;
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (fileSize > maxSize) {
        socket.emit('upload_error', { message: 'File size exceeds 10MB limit' });
        return;
      }

      // Validate MIME type
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/tiff', 'image/bmp', 'image/avif',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'text/csv', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ];

      if (!allowedMimeTypes.includes(mimeType)) {
        socket.emit('upload_error', { message: 'Invalid file type. Only images and documents are allowed.' });
        return;
      }

      // Determine attachment type (image or document)
      const attachmentType = mimeType.startsWith('image/') ? 'image' : 'document';

      try {
        // Convert base64 string to buffer if needed
        let buffer;
        if (typeof fileBuffer === 'string') {
          // Remove data URL prefix if present
          const base64Data = fileBuffer.replace(/^data:[^;]+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          buffer = Buffer.from(fileBuffer);
        }

        // Generate unique filename
        const ext = fileName.split('.').pop();
        const timestamp = Date.now();
        const s3Key = `saralbuy/chat-attachments/${timestamp}-${fileName}`;

        // Upload to S3
        const uploadParams = {
          Bucket: process.env.Bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
        };

        const s3Response = await s3.upload(uploadParams).promise();

        // Send success response with file URL and metadata
        socket.emit('upload_success', {
          url: s3Response.Location,
          type: attachmentType,
          mimeType,
          fileName,
          fileSize: buffer.length,
        });

        console.log(`File uploaded successfully: ${s3Response.Location}`);
      } catch (err) {
        console.error('Error uploading file to S3:', err);
        socket.emit('upload_error', { message: 'Failed to upload file', error: err.message });
      }
    });

    // Handle sending messages
socket.on('send_message', async (data) => {
  const { productId, sellerId, message, senderId, senderType, buyerId, attachment } = data;

  // Validate required fields
  if (!productId || !sellerId || !message || !senderId || !senderType) {
    socket.emit('error', { message: 'Missing required fields for sending message' });
    return;
  }

  // Validate attachment if provided
  if (attachment) {
    if (!attachment.url || !attachment.type || !attachment.mimeType || !attachment.fileName) {
      socket.emit('error', { message: 'Invalid attachment data. Required: url, type, mimeType, fileName' });
      return;
    }
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

    // Add attachment if provided
    if (attachment) {
      msgObj.attachment = {
        url: attachment.url,
        type: attachment.type,
        mimeType: attachment.mimeType,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize || null,
      };
    }

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
      attachment: msgObj.attachment || null,
      roomId,
      lastMessage: chat?.lastMessage || msgObj,
      messageCount: chat?.messages?.length || 0,
      buyerUnreadCount: chat?.buyerUnreadCount || 0,
      sellerUnreadCount: chat?.sellerUnreadCount || 0,
      chatrating: chat?.chatrating
    });

    // Emit last message update for sidebar/chat list
    io.to(roomId).emit('chat_last_message_update', {
      roomId,
      lastMessage: chat?.lastMessage || msgObj,
      buyerUnreadCount: chat?.buyerUnreadCount || 0,
      sellerUnreadCount: chat?.sellerUnreadCount || 0,
      chatrating: chat?.chatrating
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
        sellerUnreadCount: chat?.sellerUnreadCount || 0,
        chatrating: chat?.chatrating
      });
    }

    console.log(`Message sent in room ${roomId} by ${senderId} (${senderType}): "${message}"`);
    console.log(`Unread counts - Buyer: ${chat?.buyerUnreadCount || 0}, Seller: ${chat?.sellerUnreadCount || 0}`);
  // --- Emit recent_chat_update to all sockets of recipient and sender ---
  try {
    // Fetch buyer and seller user details to include names
    const [buyerUser, sellerUser] = await Promise.all([
      User.findById(finalBuyerId).select('firstName lastName').lean(),
      User.findById(sellerId).select('firstName lastName').lean()
    ]);

    // Check online status
    const buyerOnline = userSockets.has(String(finalBuyerId)) && userSockets.get(String(finalBuyerId)).size > 0;
    const sellerOnline = userSockets.has(String(sellerId)) && userSockets.get(String(sellerId)).size > 0;

    // Prepare recent chat summary
    const recentChatSummary = {
      roomId,
      productId,
      buyerId: finalBuyerId,
      sellerId,
      buyerName: buyerUser ? `${buyerUser.firstName || ''} ${buyerUser.lastName || ''}`.trim() : '',
      sellerName: sellerUser ? `${sellerUser.firstName || ''} ${sellerUser.lastName || ''}`.trim() : '',
      buyerOnline,
      sellerOnline,
      lastMessage: chat?.lastMessage || msgObj,
      messageCount: chat?.messages?.length || 0,
      buyerUnreadCount: chat?.buyerUnreadCount || 0,
      sellerUnreadCount: chat?.sellerUnreadCount || 0,
      chatrating: chat?.chatrating
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
            
            // Check online status
            const buyerOnline = userSockets.has(String(chat.buyerId)) && userSockets.get(String(chat.buyerId)).size > 0;
            const sellerOnline = userSockets.has(String(chat.sellerId)) && userSockets.get(String(chat.sellerId)).size > 0;
            
            return {
              _id: chat._id,
              roomId: chat.roomId,
              product: productMap[String(chat.productId)] || null,
              buyer: userMap[String(chat.buyerId)] || null,
              seller: userMap[String(chat.sellerId)] || null,
              buyerOnline,
              sellerOnline,
              messages: chat.messages || [],
              lastMessage: chat.lastMessage || (chat.messages?.length > 0 ? chat.messages[chat.messages.length - 1] : null),
              messageCount: chat.messages?.length || 0,
              buyerUnreadCount: chat.buyerUnreadCount || 0,
              sellerUnreadCount: chat.sellerUnreadCount || 0,
              chatrating: chat.chatrating,
              userType
            };
          });

        socket.emit('recent_chats', { chats: recentChats });
      } catch (err) {
        console.error('Error fetching recent chats:', err);
        socket.emit('error', { message: 'Failed to fetch recent chats', error: err.message });
      }
    });

    // Check if a specific user is online
    socket.on('check_user_status', (data) => {
      const { userId } = data;
      if (!userId) {
        socket.emit('error', { message: 'Missing userId for checking status' });
        return;
      }

      const isOnline = userSockets.has(String(userId)) && userSockets.get(String(userId)).size > 0;
      
      socket.emit('user_status_response', {
        userId,
        isOnline
      });
    });

    // Handle rating a chat
    socket.on('rate_chat', async (data) => {
      const { chatId, rating, ratedBy } = data;

      // Validate required fields
      if (!chatId || typeof rating !== 'number') {
        socket.emit('error', { message: 'chatId and rating are required' });
        return;
      }
      if (rating < 1 || rating > 5) {
        socket.emit('error', { message: 'Rating must be between 1 and 5' });
        return;
      }
      if (!ratedBy) {
        socket.emit('error', { message: 'ratedBy (userId) is required' });
        return;
      }

      try {
        // Update the chat rating
        const chat = await Chat.findByIdAndUpdate(
          chatId,
          { chatrating: rating },
          { new: true }
        ).lean();

        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        // Get the user who rated
        const rater = await User.findById(ratedBy).select('firstName lastName').lean();
        const raterName = rater ? `${rater.firstName || ''} ${rater.lastName || ''}`.trim() : 'Someone';

        const notificationPayload = {
          chatId: chat._id,
          roomId: chat.roomId,
          rating,
          ratedBy,
          raterName,
          timestamp: new Date(),
          message: `${raterName} rated this chat ${rating} stars`,
          chatrating: rating
        };

        // Emit to the room (all users currently in the chat)
        io.to(chat.roomId).emit('chat_rated', notificationPayload);

        // Also emit to all sockets of buyer and seller (even if not in room)
        const buyerIdStr = String(chat.buyerId);
        const sellerIdStr = String(chat.sellerId);

        // Notify buyer
        const buyerSockets = userSockets.get(buyerIdStr);
        if (buyerSockets) {
          for (const sockId of buyerSockets) {
            const buyerSocket = io.sockets.sockets.get(sockId);
            if (buyerSocket) {
              buyerSocket.emit('chat_rating_notification', notificationPayload);
            }
          }
        }

        // Notify seller
        const sellerSockets = userSockets.get(sellerIdStr);
        if (sellerSockets) {
          for (const sockId of sellerSockets) {
            const sellerSocket = io.sockets.sockets.get(sockId);
            if (sellerSocket) {
              sellerSocket.emit('chat_rating_notification', notificationPayload);
            }
          }
        }

        // Confirm to the rater
        socket.emit('rating_success', {
          message: 'Chat rated successfully',
          chat: {
            _id: chat._id,
            chatrating: rating
          }
        });

        console.log(`Chat ${chatId} rated ${rating} stars by user ${ratedBy}. Notifications sent to buyer ${buyerIdStr} and seller ${sellerIdStr}`);
      } catch (err) {
        console.error('Error rating chat:', err);
        socket.emit('error', { message: 'Failed to rate chat', error: err.message });
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
    socket.on('disconnect', async (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);

      const disconnectedUserId = socket.userId;

      // Clean up user socket mapping
      if (socket.userId && userSockets.has(socket.userId)) {
        userSockets.get(socket.userId).delete(socket.id);
        
        // If user has no more active sockets, they are offline
        if (userSockets.get(socket.userId).size === 0) {
          userSockets.delete(socket.userId);
          
          // Notify all users who have chats with this user that they went offline
          try {
            const chats = await Chat.find({
              $or: [
                { buyerId: new mongoose.Types.ObjectId(disconnectedUserId) },
                { sellerId: new mongoose.Types.ObjectId(disconnectedUserId) }
              ]
            }).select('buyerId sellerId').lean();

            // Collect all unique user IDs who have chats with this user
            const notifyUserIds = new Set();
            chats.forEach(chat => {
              const buyerIdStr = String(chat.buyerId);
              const sellerIdStr = String(chat.sellerId);
              if (buyerIdStr === disconnectedUserId) {
                notifyUserIds.add(sellerIdStr);
              } else {
                notifyUserIds.add(buyerIdStr);
              }
            });

            // Emit user_offline event to all relevant users
            const offlinePayload = {
              userId: disconnectedUserId,
              timestamp: new Date()
            };

            for (const notifyUserId of notifyUserIds) {
              const recipientSockets = userSockets.get(notifyUserId);
              if (recipientSockets) {
                for (const sockId of recipientSockets) {
                  const recipientSocket = io.sockets.sockets.get(sockId);
                  if (recipientSocket) {
                    recipientSocket.emit('user_offline', offlinePayload);
                  }
                }
              }
            }

            console.log(`User ${disconnectedUserId} is now offline. Notified ${notifyUserIds.size} users.`);
          } catch (err) {
            console.error('Error notifying users of offline status:', err);
          }
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