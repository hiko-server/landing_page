import { NextRouter } from "next/router"


export const getCurrentURLPath = (router: NextRouter) => {

    let path = router.pathname.split('/').filter((i) => i !== '')
    return path
}
