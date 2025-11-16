import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderType: {
      type: String,
      enum: ['buyer', 'seller'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messages: [messageSchema],
    lastMessage: {
      type: Object,
      default: null
    },
    buyerUnreadCount: {
      type: Number,
      default: 0,
    },
    sellerUnreadCount: {
      type: Number,
      default: 0,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Add chatrating field to the schema
chatSchema.add({
  chatrating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  }
});

export default mongoose.model('Chat', chatSchema);