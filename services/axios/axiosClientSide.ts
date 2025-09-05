import checkIsAuth from "../../helpers/checkIsAuth";
import axiosClient from "./axiosInstance"

const axios_clinet_sides = async (
  payload: any,
  url: string,
  method: string = "POST"
) => {
  let successObject: { success: boolean; data: any } | undefined = undefined
  let errorObject: { success: boolean; error: { description: any; status: string } } | undefined = undefined
  try {
    console.log(url, payload)
    checkIsAuth()
    let response
    switch (method) {
      case "GET":
        response = await axiosClient.get(url, payload)
        break;
      case "POST":
        response = await axiosClient.post(url, payload)
        break;
      case "DELETE":
        let payload2Delete = { data: payload }
        response = await axiosClient.delete(url, payload2Delete)
        break;
      case "PUT":
        response = await axiosClient.put(url, payload)
        break;
      default:
        console.log('not yet implemented')
        response = { data: undefined }
        break
    }


    console.log(url, 'success')
    successObject = {
      success: true,
      data: response.data
    }
  } catch (e: any) {
    console.error(`\n\nerror when requesting: ${url}, ${e}`)
    errorObject = {
      success: false,
      error: {
        description: e.response?.data?.message ?? e.message,
        status:
          e.response?.data?.statusCode == 400 ? 'info' : 'error',
      }
    }
  } finally {
    return new Promise((resolve, reject) => {
      if (successObject) resolve(successObject)
      else reject(errorObject)
    })
  }
}
export default axios_clinet_sides