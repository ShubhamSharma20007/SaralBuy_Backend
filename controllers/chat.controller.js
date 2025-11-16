import Chat from '../schemas/chat.schema.js';

/**
 * Rate a chat by setting its chatrating field.
 * Expects: req.body = { chatId: String, rating: Number }
 */
export const rateChat = async (req, res) => {
  try {
    const { chatId, rating } = req.body;

    if (!chatId || typeof rating !== 'number') {
      return res.status(400).json({ message: 'chatId and rating are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { chatrating: rating },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found.' });
    }

    return res.status(200).json({ message: 'Chat rated successfully.', chat });
  } catch (error) {
    return res.status(500).json({ message: 'Server error.', error: error.message });
  }
};