import { useEffect } from 'react'
import axios from 'axios'
import url from 'url'
import qs from 'qs'
import jwt from 'jsonwebtoken'
import { Button } from '@chakra-ui/react'
import router from 'next/router'

// const styles = { App: '_1RLww', lineButton: '_RU-K2' }

const LINE_API = process.env.NEXT_PUBLIC_LINE_AUTH_BASE
const LINE_Channel_ID = process.env.NEXT_PUBLIC_LINE_CHANNEL_ID
// const LINE_CHANNEL_SECRET = process.env.NEXT_PUBLIC_LINE_CHANNEL_SECRET
const LINE_Callback_URL = process.env.NEXT_PUBLIC_LINE_CALLBACK_URL

export const LINE_Auth = `${LINE_API}response_type=code&client_id=${LINE_Channel_ID}&redirect_uri=${LINE_Callback_URL}&scope=openif%20profile&state=abcde`

// const maxAge = 120
const LineLogin = (_ref: any) => {
  const clientID = _ref.clientID,
    clientSecret = _ref.clientSecret,
    // state = _ref.state,
    nonce = _ref.nonce,
    // scope = _ref.scope,
    setPayload = _ref.setPayload,
    setIdToken = _ref.setIdToken,
    redirectURI = _ref.redirectURI

  const lineLogin = () => {
    // const query = qs.stringify({
    //   response_type: 'code',
    //   client_id: clientID,
    //   state: state,
    //   scope: scope,
    //   nonce: nonce,
    //   prompt: 'consent',
    //   max_age: maxAge,
    //   bot_prompt: 'normal',
    // })
    // const lineAuthoriseURL =
    //   process.env.NEXT_PUBLIC_LINE_AUTH_BASE +
    //   query +
    //   '&redirect_uri=' +
    //   redirectURI
    router.push(LINE_Auth)
  }

  const getAccessToken = function getAccessToken(callbackURL: string) {
    const urlParts = url.parse(callbackURL, true)
    const query = urlParts.query
    const hasCodeProperty = Object.prototype.hasOwnProperty.call(query, 'code')

    if (hasCodeProperty) {
      const reqBody = {
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: redirectURI,
        client_id: clientID,
        client_secret: clientSecret,
      }
      const reqConfig = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
      axios
        .post(
          'https://api.line.me/oauth2/v2.1/token',
          qs.stringify(reqBody),
          reqConfig
        )
        .then(function (res) {
          if (setPayload) setPayload(res.data)

          try {
            const decodedIdToken = jwt.verify(res.data.id_token, clientSecret, {
              algorithms: ['HS256'],
              audience: clientID.toString(),
              issuer: 'https://access.line.me',
              nonce: nonce,
            })
            if (setIdToken) setIdToken(decodedIdToken)
          } catch (err) {
            console.log(err)
          }
        })
        ['catch'](function (err) {
          console.log(err)
        })
    }
  }

  useEffect(
    function () {
      getAccessToken(window.location.href)
    },
    [clientID]
  )
  return (
    <Button
      variant="solid"
      color={'white'}
      bgColor="green"
      _hover={{ shadow: 'base', bgColor: 'white', color: 'black' }}
      onClick={() => {
        lineLogin()
      }}
    >
      Sign in with Line{' '}
    </Button>
  )
}

export { LineLogin }
