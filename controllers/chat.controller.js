import Chat from '../schemas/chat.schema.js';
import User from '../schemas/user.schema.js';
import productNotificationSchema from '../schemas/productNotification.schema.js';

/**
 * Rate a chat by setting its chatrating field.
 * Expects: req.body = { chatId: String, rating: Number, ratedBy: String (userId) }
 */
export const rateChat = async (req, res) => {
  try {
    const { chatId, rating, ratedBy } = req.body;

    if (!chatId || typeof rating !== 'number') {
      return res.status(400).json({ message: 'chatId and rating are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }
    if (!ratedBy) {
      return res.status(400).json({ message: 'ratedBy (userId) is required.' });
    }

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { chatrating: rating },
      { new: true }
    ).populate('buyerId', 'firstName lastName')
     .populate('sellerId', 'firstName lastName');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found.' });
    }

    // Get the user who rated
    const rater = await User.findById(ratedBy).select('firstName lastName');
    const raterName = rater ? `${rater.firstName || ''} ${rater.lastName || ''}`.trim() : 'Someone';

    // Save notification to database for the other party
    try {
      // Determine who should receive the notification (the other party)
      const recipientId = String(chat.buyerId._id) === String(ratedBy) 
        ? chat.sellerId._id  // If buyer rated, notify seller
        : chat.buyerId._id;  // If seller rated, notify buyer
      
      if (chat.productId) {
        await productNotificationSchema.create({
          userId: recipientId,
          productId: chat.productId,
          title: `Chat rated ${rating} stars`,
          description: `${raterName} rated your conversation ${rating} out of 5 stars`,
          seen: false
        });
        
        console.log(`Rating notification saved to database for user ${recipientId}`);
      }
    } catch (notifError) {
      console.error("Failed to create rating notification:", notifError.message);
    }

    // Emit socket notification to both buyer and seller
    const io = global.io;
    const userSockets = global.userSockets;

    if (io && userSockets) {
      const buyerIdStr = String(chat.buyerId._id);
      const sellerIdStr = String(chat.sellerId._id);

      const notificationPayload = {
        chatId: chat._id,
        roomId: chat.roomId,
        rating,
        ratedBy,
        raterName,
        timestamp: new Date(),
        message: `${raterName} rated this chat ${rating} stars`
      };

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

      console.log(`Rating notification sent to buyer ${buyerIdStr} and seller ${sellerIdStr} for chat ${chatId}`);
    }

    return res.status(200).json({ message: 'Chat rated successfully.', chat });
  } catch (error) {
    return res.status(500).json({ message: 'Server error.', error: error.message });
  }
};