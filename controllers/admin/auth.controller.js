import userSchema from "../../schemas/user.schema.js";
import { ApiResponse } from "../../helper/ApiReponse.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
export const signUp = async (req, res) => {
    try {
        const { email, password, fname, lname } = req.body;
        if(!email,!password,!fname,!lname){
            ApiResponse.errorResponse(res,400,"Please provide all fields");
            return;
        }
        if(password.toString().length < 6){
            ApiResponse.errorResponse(res,400,"Password must be at least 6 characters long");
            return;
        }
        
        const existingUser = await userSchema.exists({email});
        if(existingUser){
            ApiResponse.errorResponse(res,400,"User already exists");
            return;
        }

        const hashPassword = await bcrypt.hash(password, 10);
        const user = await userSchema.create({
            email,
            password:hashPassword,
            firstName:fname,
            lastName:lname,
            phone:Math.floor(Math.random() * 1000000000),
            role:'admin'
        });
           const payload = {_id:user._id,role:user.role};
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
            res.cookie('adminToken', token, {
              sameSite: "none",
              httpOnly: true,
              secure: true,
              path: '/'
            });

        ApiResponse.successResponse(res, 200, user);
    } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
        
    }
};

export const signIn = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            ApiResponse.errorResponse(res, 400, "Email and password are required");
            return;
        }
        const user = await userSchema.findOne({ email }).lean();
        if (!user) {
            ApiResponse.errorResponse(res, 400, "User not found");
            return;
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            ApiResponse.errorResponse(res, 400, "Invalid password");
            return;
        }
        const payload = {_id:user._id,role:user.role};
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie('adminToken', token, {
          sameSite: "none",
          httpOnly: true,
          secure: true,
          path: '/'
        })
        ApiResponse.successResponse(res, 200, "Login successful", { token, user });
    } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
    }
}

export const logout = (req,res)=>{
    res.clearCookie('adminToken');
    ApiResponse.successResponse(res, 200, "Logout successful");
}

export const getProfile = async(req,res)=>{
    const user = req.user._id;
    try {
      const findAdmin =  await userSchema.findOne({_id:user,role:'admin'}).lean()
      if(!findAdmin){
        ApiResponse.errorResponse(res, 400, "User not found");
        return;
      }
      ApiResponse.successResponse(res, 200, "Profile fetched successfully", findAdmin); 
    } catch (error) {
      ApiResponse.errorResponse(res, 400, error.message);
        
    }
}