import jwt from 'jsonwebtoken';
import { ApiResponse } from '../helper/ApiReponse.js';

const auth = (req, res, next) => {

  const token =req.cookies?.authToken;

  if (!token) return ApiResponse.errorResponse(res, 401, 'Token not found');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log('auth middleware decoded:', decoded);
    req.user = {
      ...decoded,
      userId: decoded.userId || decoded._id
    };
    console.log('auth middleware req.user:', req.user);
    next();
  } catch (err) {
    ApiResponse.errorResponse(res, 401, 'Invalid token');
  }
};

export default auth;