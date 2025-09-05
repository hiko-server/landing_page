import { Button, Flex } from "@chakra-ui/react";
import { useRouter } from "next/router";
import React from "react";
import LandingLayout from "../../layout/LandingLayout";
import RootBaseLayout from "../../layout/RootBase";

const DemoPage = () => {
  const router = useRouter();
  
  return (
    <React.Fragment>
      <RootBaseLayout>
        <LandingLayout>
          <Flex padding={"20px"} direction={'column'} justifyContent={'center'} alignItems={'center'} gap={"20px"}>
            <Flex direction={'column'} gap={"40px"} mt={"100px"}>
              <Button size='lg' w={"300px"} fontSize={"22px"} onClick={() => {
                router.push("/demo/route-planning");
              }}>Route Planning</Button>
              <Button size='lg' w={"300px"} fontSize={"22px"} onClick={() => {
                router.back();
              }}>Go Back</Button>
            </Flex>
          </Flex>
        </LandingLayout>
      </RootBaseLayout>
    </React.Fragment>
  );
}

export default DemoPage;