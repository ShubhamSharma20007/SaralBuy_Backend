import mongoose from "mongoose";

let connection = null;
export default function mongoCtx(){
   if(connection){
       return connection
   } 
   connection =  mongoose.connect(process.env.DB_CTX,{
        dbName:'saralbuy'
    })
    .then(() => {
        console.log("Connected to MongoDB 🚀");
    })
    .catch((error) => {
        console.error("Error connecting to MongoDB", error);
    });
}