const productionMode = process.env.NEXT_PUBLIC_PRODUCTION_MODE === "production"

export const cl = (msg: string, data: any = null) => {
    return productionMode ? null : console.log(`\n\n`, msg, data ? data : null)
}