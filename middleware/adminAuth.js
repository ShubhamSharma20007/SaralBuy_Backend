import jwt from 'jsonwebtoken';
import { ApiResponse } from '../helper/ApiReponse.js';

const adminAuth = (req, res, next) => {

  const token =req.cookies.adminToken || '';

  if (!token) return ApiResponse.errorResponse(res, 401, 'Token not found');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded
    console.log('auth middleware req.user:', req.user);
    next();
  } catch (err) {
    ApiResponse.errorResponse(res, 401, 'Invalid token');
  }
};

export default adminAuth;