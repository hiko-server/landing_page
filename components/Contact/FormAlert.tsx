import { Fragment } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  HStack,
  Text,
  VStack
} from "@chakra-ui/react";

interface ErrorMessageProps {
  responseCode: number;
  UIMessage: string;
}

const FormAlert = ({
  responseCode,
  UIMessage
}: ErrorMessageProps): JSX.Element => {
  const serverError = (
    <Box>
      <Alert status="error" variant="solid" mb={7}>
        <HStack justifyContent="center" alignContent="center">
          <AlertIcon />
          <VStack justifyContent="center" alignContent="center" spacing={0}>
            <AlertTitle>
              {"Something went wrong with the server or API."}
            </AlertTitle>
            <AlertDescription>
              <VStack justifyContent="center" alignContent="center" spacing={0}>
                {UIMessage.split("\n").map((line) => {
                  return <Text key={line.replace(" ", "-")}>{line}</Text>;
                })}
              </VStack>
            </AlertDescription>
          </VStack>
        </HStack>
      </Alert>
    </Box>
  );

  const clientError = (
    <Box>
      <Alert status="warning" variant="solid" mb={7}>
        <HStack justifyContent="center" alignContent="center">
          <AlertIcon />
          <VStack justifyContent="center" alignContent="center" spacing={0}>
            <AlertTitle>
              {"Something went wrong with the form or site."}
            </AlertTitle>
            <AlertDescription>
              <VStack justifyContent="center" alignContent="center" spacing={0}>
                {UIMessage.split("\n").map((line) => {
                  return <Text key={line.replace(" ", "-")}>{line}</Text>;
                })}
              </VStack>
            </AlertDescription>
          </VStack>
        </HStack>
      </Alert>
    </Box>
  );

  const success = (
    <Box>
      <Alert status="success" variant="subtle" mb={7}>
        <HStack justifyContent="center" alignContent="center">
          <AlertIcon />
          <VStack justifyContent="center" alignContent="center" spacing={0}>
            <AlertTitle>{"Success!"}</AlertTitle>
            <AlertDescription>
              <VStack justifyContent="center" alignContent="center" spacing={0}>
                {UIMessage.split("\n").map((line) => {
                  return <Text key={line.replace(" ", "-")}>{line}</Text>;
                })}
              </VStack>
            </AlertDescription>
          </VStack>
        </HStack>
      </Alert>
    </Box>
  );

  const info = (
    <Box>
      <Alert status="info" variant="subtle" mb={7}>
        <HStack justifyContent="center" alignContent="center">
          <AlertIcon />
          <VStack justifyContent="center" alignContent="center" spacing={0}>
            <AlertTitle>{"Something went wrong."}</AlertTitle>
            <AlertDescription>
              <VStack justifyContent="center" alignContent="center" spacing={0}>
                {UIMessage.split("\n").map((line) => {
                  return <Text key={line.replace(" ", "-")}>{line}</Text>;
                })}
              </VStack>
            </AlertDescription>
          </VStack>
        </HStack>
      </Alert>
    </Box>
  );

  if (responseCode === 1) {
    return info;
  } else if (responseCode >= 200 && responseCode <= 299) {
    return success;
  } else if (responseCode >= 400 && responseCode <= 499) {
    return clientError;
  } else if (responseCode >= 500 && responseCode <= 599) {
    return serverError;
  } else {
    return <Fragment></Fragment>;
  }
};

export default FormAlert;