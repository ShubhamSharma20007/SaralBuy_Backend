import express from "express"
const router = express.Router();
import categoryRouter from "./category.route.js"
import productRouter from "./product.route.js"
import userRouter from "./user.route.js"
import bidRouter from "./bid.route.js"
import requirementRouter from "./requirement.route.js"
import cartRouter from "./cart.route.js"
import authRoute from "./admin/auth.route.js"
import dashboardRoute from "./admin/dashboard.route.js"
import adminUserRouter from "./admin/user.route.js"
import chatRouter from "./chat.route.js";

//  admin routes
const adminRoutes =[
    {path:"/admin/auth",router:authRoute},
    {path:"/admin/dashboard",router:dashboardRoute},
    {path:"/admin/user",router:adminUserRouter},
]

// user routes
const routes =[
    {path:"/category",router:categoryRouter},
    {path:"/product",router:productRouter},
    {path:'/user',router:userRouter},
    {path:'/bid',router:bidRouter},
    {path:'/requirement',router:requirementRouter},
    {path:'/cart',router:cartRouter},
    {path:'/chat',router:chatRouter},
    ...adminRoutes
]


routes.forEach((route)=>{
    router.use(route.path,route.router)
})

export default router

