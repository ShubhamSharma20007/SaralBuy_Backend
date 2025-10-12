import express from 'express'
import { CreateCategories ,GetCategories, UpdateCategory,GetCategoriesById} from '../controllers/category.controller.js'
import uploadSingleImage from '../middleware/uploadMiddleware.js'
const router = express.Router()


router.post('/create-category',uploadSingleImage,CreateCategories)
router.get('/get-category/:categoryId',GetCategoriesById)
router.put('/update-category/:categoryId',uploadSingleImage,UpdateCategory)
router.get('/get-category',GetCategories)

export default router