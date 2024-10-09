import * as yup from 'yup'

export const loginSchema = yup
  .object({
    username: yup
      .string()
      .required()
      .min(3, 'length of username should be greater than 3')
      .max(10, 'length of username should be less than 10'),
    password: yup.string().required(),
  })
  .required()

export const validateEmailSchema = yup.object().shape({
  email: yup
    .string()
    .email('Invalid email format')
    .required('Please enter your register email')
    .test('Validate Email', 'Please provide a valid email', (value) => {
      const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      return re.test(String(value).toLowerCase())
    }),
})

export const validateResetPasswordSchema = yup.object().shape({
  password: yup
    .string()
    .required('Please enter your password')
    .min(8, 'Password must be at least 8 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
      'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 number and 1 special character'
    ),
  password_confirmation: yup
    .string()
    .required('Please confirm your password')
    .oneOf([yup.ref('password'), ""], 'Passwords must match'),
  token: yup.string().required(),
})
