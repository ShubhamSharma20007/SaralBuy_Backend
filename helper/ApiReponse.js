class ApiResponse{
    constructor(statusCode,message="success",data=null){
        this.statusCode = statusCode;
        this.message = message;
        this.data = data;
    }
    static successResponse(res,statusCode,message="success",data=null){
        return res.status(statusCode).json(new ApiResponse(statusCode,message,data));
    }
    static errorResponse(res,statusCode,message="error",data=null){
        return res.status(statusCode).json(new ApiResponse(statusCode,message,data));
    }
}

export {ApiResponse}