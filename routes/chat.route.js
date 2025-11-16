import express from 'express';
import { rateChat } from '../controllers/chat.controller.js';

const chatRouter = express.Router();

/**
 * @route POST /chat/rate
 * @desc Rate a chat
 * @access Public or protected (add auth middleware if needed)
 */
chatRouter.post('/rate', rateChat);

export default chatRouter;