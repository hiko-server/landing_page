import * as yup from 'yup'

export const changePasswordSchema = yup.object().shape({
  password: yup
    .string()
    .required('Please enter your password')
    .min(
      8,
      'Password must contain 8 or more characters with at least one of each: uppercase, lowercase, number and special'
    )
    .max(26)
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])/,
      'It must must contain at least 1 lower case letter and 1 upper case letter'
    )
    .matches(
      /^(?=.*[!@#\$%\^&\*])/,
      'It must contain at least 1 special character'
    )
    .matches(/^(?=.{6,20}$)\D*\d/, 'It must contain at least 1 number')
    .matches(/^\S+$/, 'Space is not allowed'),
})
