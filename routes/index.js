import express from "express"
import categoryRouter from "./category.route.js"
import productRouter from "./product.route.js"
import userRouter from "./user.route.js"
import bidRouter from "./bid.route.js"
import requirementRouter from "./requirement.route.js"
import cartRouter from "./cart.route.js"
const router = express.Router();




const routes =[
    {path:"/category",router:categoryRouter},
    {path:"/product",router:productRouter},
    {path:'/user',router:userRouter},
    {path:'/bid',router:bidRouter},
    {path:'/requirement',router:requirementRouter},
    {path:'/cart',router:cartRouter}
]


routes.forEach((route)=>{
    router.use(route.path,route.router)
})

export default router

