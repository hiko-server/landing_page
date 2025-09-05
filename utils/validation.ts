export const validateEmail = (email: string) => {
  const emailReg =
    /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return emailReg.test(email.toLowerCase())
}

export const validatePassword = (password: string) => {
  const pwReg =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&\.])[A-Za-z\d@$!%*?&\.]{8,}$/
  return pwReg.test(password)
}

export const validateMobile = (mobile: {
  countryCode: string
  body: string
}) => {
  if (mobile.countryCode === '852') {
    if (mobile.body.length !== 8) {
      return false
    }
  } else if (mobile.countryCode === '886') {
    if (mobile.body.length !== 10) {
      return false
    }
  } else {
    return false
  }
  return true
}

export const isValidUrl = (url: string) => {
  try {
    new URL(url)
    return true
  } catch (err) {
    return false
  }
}
