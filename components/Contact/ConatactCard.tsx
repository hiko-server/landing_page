import React, { useState, useEffect } from "react";
import emailjs from "@emailjs/browser";
import Captcha from "./Captcha";
import { Box, Button, Input, Textarea, VStack, Text, FormControl, FormErrorMessage, Alert, AlertIcon, AlertTitle } from "@chakra-ui/react";
import { motion } from "framer-motion";
import FormAlert from "./FormAlert";
import EmojiValidate from "./EmojiValidate";
import { Formik, Form, Field } from "formik";

export const MotionBox = motion(Box);


const ContactCard = (): JSX.Element => {
    
  // Form field valid statuses.
  const [validName, setValidName] = useState<boolean>(false);
  const [validEmail, setValidEmail] = useState<boolean>(false);
  const [validSubject, setValidSubject] = useState<boolean>(false);
  const [validMessage, setValidMessage] = useState<boolean>(false);

  // Captcha
  const [token, setToken] = useState<null | string>(null);
  // Captcha reset
  const [reset, setReset] = useState<boolean>(false);

  // Entire form valid
  const [validForm, setValidForm] = useState<boolean>(false);

  const [sendSuccess, setSendSuccess] = useState<boolean>(false);

  // Validate the fields when any of them change.
  useEffect(() => {
    if (
      !validEmail ||
      !validMessage ||
      !validName ||
      !validSubject ||
      token === null
    ) {
      setValidForm(false);
    }

    if (validEmail && validMessage && validName && validSubject && token) {
      setValidForm(true);
    }
  }, [validEmail, validMessage, validName, validSubject, token]);

  // * Response Handling * //
  const [resData, setResData] = useState<{
    UIMessage: string;
    resCode: number;
  }>({ UIMessage: "", resCode: 0 });
  

  


  const handleSubmit = async (values: { name: string; email: string; subject: string; message: string }) => {
    console.log('Submitted values:', values);
    if (!validForm) return;
    if (validForm) {
      try {
        const templateParams = {
          name: values.name,
          email: values.email,
          subject: values.subject,
          message: values.message,
        };
        console.log('templateParams', templateParams)
        await emailjs.init({
            publicKey: "O6yGkJqJY2EqYUIWl",
            // Do not allow headless browsers
            blockHeadless: true,
          });
        await emailjs.send(
            "service_48ggywd",
            "template_hla69tv", 
            templateParams,
            process.env.REACT_APP_EMAILJS_PUBLIC_KEY!,
        ).then(
            (response) => {
              console.log('SUCCESS!', response.status, response.text);
              setSendSuccess(true);
            },
            (error) => {
              console.log('FAILED...', error);
              setSendSuccess(false);
            },
          );

        setResData({ resCode: 200, UIMessage: "Email sent successfully" });
      } catch (error) {
        setResData({
          resCode: 1,
          UIMessage: `An unknown error occurred. Please try again.\nIf the error persists contact me directly at ${process.env.REACT_APP_CONTACT_EMAIL}`,
        });
        console.error("Error sending email:", error);
      }
    }
  };

  const validateName = (name: string) => {
    if (name.trim().length > 0) {
      setValidName(true);
    } else {
      setValidName(false);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
      setValidEmail(true);
    } else {
      setValidEmail(false);
    }
  };

  const validateSubject = (subject: string) => {
    if (subject.trim().length > 0) {
      setValidSubject(true);
    } else {
      setValidSubject(false);
    }
  };

  const validateMessage = (message: string) => {
    if (message.trim().length > 0) {
      setValidMessage(true);
    } else {
      setValidMessage(false);
    }
  };

  return (
    <VStack h="auto" w="100%" spacing={6}>
    <Text fontSize="2xl" color="brand.primary" fontWeight="bold">{"Contact Me"}</Text>
      <Formik
        initialValues={{ name: "", email: "", subject: "", message: "" }}
        onSubmit={(values, actions) => {
          handleSubmit(values);
          actions.setSubmitting(false);
        }}
        validate={(values) => {
          const errors: Partial<typeof values> = {};

          if (!values.name) errors.name = "Name is required";
          if (!values.email) errors.email = "Invalid email address";
          if (!values.subject) errors.subject = "Subject is required";
          if (!values.message) errors.message = "Message is required";

          return errors;
        }}
      >
        {({ isSubmitting }) => (
          <Form>
            <VStack h="auto" w="100%" spacing={6}>
              <Field name="name" validate={validateName}>
                {({ field, meta }: { field: any; meta: any }) => (
                  <FormControl isInvalid={!!meta.error && meta.touched}>
                    <Input {...field} placeholder="Name" />
                    <FormErrorMessage>{meta.error}</FormErrorMessage>
                  </FormControl>
                )}
              </Field>
              <Field name="email" validate={validateEmail}>
                {({ field, meta }: { field: any; meta: any }) => (
                  <FormControl isInvalid={!!meta.error && meta.touched}>
                    <Input {...field} placeholder="Email" type="email" />
                    <FormErrorMessage>{meta.error}</FormErrorMessage>
                  </FormControl>
                )}
              </Field>
              <Field name="subject" validate={validateSubject}>
                {({ field, meta }: { field: any; meta: any }) => (
                  <FormControl isInvalid={!!meta.error && meta.touched}>
                    <Input {...field} placeholder="Subject" />
                    <FormErrorMessage>{meta.error}</FormErrorMessage>
                  </FormControl>
                )}
              </Field>
              <Field name="message" validate={validateMessage}>
                {({ field, meta }: { field: any; meta: any }) => (
                  <FormControl isInvalid={!!meta.error && meta.touched}>
                    <Textarea {...field} placeholder="Message" />
                    <FormErrorMessage>{meta.error}</FormErrorMessage>
                  </FormControl>
                )}
              </Field>
              <VStack h="auto" w="100%" spacing={6}>
                <VStack h="auto" w="100%" spacing={2}>
                  <strong>
                    <Text fontSize="sm" color="brand.danger">
                      {"Do not contact with unsolicited services or offers"}
                    </Text>
                  </strong>
                  <Text fontSize="sm">
                    {"Form ready to submit? "}
                    {validForm ? (
                      <EmojiValidate type="Valid" />
                    ) : (
                      <EmojiValidate type="Error" />
                    )}
                  </Text>
                </VStack>
                <VStack h="auto" w="100%" spacing={6}>
                  <Captcha updateToken={setToken} shouldReset={reset} updateReset={setReset} />
                  <MotionBox whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    {
                        sendSuccess ? (
                            <Alert status="success">
                                <AlertIcon />
                                <AlertTitle mr={2}>Success To Send!</AlertTitle>
                                
                            </Alert>
                        ) : (
                            <Button
                                variant="submit"
                                isDisabled={!validForm}
                                background={validForm ? "brand.valid" : "brand.danger"}
                                isLoading={isSubmitting}
                                type="submit"
                                >
                                {"Submit"}
                            </Button>
                        )
                    }
                    
                  </MotionBox>
                </VStack>
              </VStack>
            </VStack>
          </Form>
        )}
      </Formik>
      {resData.UIMessage && <FormAlert UIMessage={resData.UIMessage} responseCode={0} />}
    </VStack>
  );
};

export default ContactCard;