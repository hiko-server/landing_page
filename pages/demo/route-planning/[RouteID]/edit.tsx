import React, { useState, useEffect } from 'react'
import { Flex } from '@chakra-ui/react'
import ASALayout from '../../../../layout/ASA'
import { QueryRouteList, RouteDetail } from '../../../../types/route'
import Panel from '../../../../components/Panels/Panel'
import LocationListContainer from '../../../../components/RoutesRelated/LocationListContainer'
import CreateEditRouteContainer from '../../../../components/RoutesRelated/CreateEditRouteContainer'
import { GetServerSideProps } from 'next'

const EditRouteDetailPage = (props: any) => {
  const [isGoing2Edit, setIsGoing2Edit] = useState(false)
  const [routeDetail, setRouteDetail] = useState<RouteDetail | null>(null)

  const [allLocation, setAllLocation] = useState([])

  const [selectedOptions, setSelectedOptions] = useState<QueryRouteList[]>([])

  // const postData = {
  //     filter: {},
  //     projection: {
  //         convertUserID: true,
  //     },
  //     options: {},
  // }

  // const payload = {
  //     filter: {
  //         routeID: [router.query.RouteID],
  //     },
  //     projection: {
  //         name: true,
  //         description: true,
  //         routeOrder: true,
  //         displayLocationName: true,
  //     },
  //     options: {},
  // }

  // useEffect(() => {
  //     if (fetchNewData) {
  //         get_route_detail(payload)
  //             .then((res: any) => {
  //                 setRouteDetail((_prev) => res.data.data[0])
  //                 setSelectedOptions((_prev) => res.data.data[0].routeOrder)
  //             })
  //             .then(() => {
  //                 list_location(postData)
  //                     .then((res: any) => {
  //                         setAllLocation(res.data.data)
  //                     })
  //                     .catch((e) => {
  //                         console.error(e)
  //                         toast({
  //                             title: e.code,
  //                             description: e.response?.data?.message ?? e.message,
  //                             status: 'error',
  //                             duration: 3000,
  //                             isClosable: false,
  //                         })
  //                     })
  //             })
  //             .catch((e) => {
  //                 console.error(e)
  //             })
  //             .finally(() => {
  //                 setFetchNewData(false)
  //             })
  //     }
  //     // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [fetchNewData])

  useEffect(() => {
    // setFetchNewData(true)
    setRouteDetail(props.data)
    setAllLocation(props.locations)
  }, [])

  return (
    <React.Fragment>
      <ASALayout>
        <Panel name={'Edit route'} disablePanelClick={true}>
          <Flex direction={'row'} gap={'20px'} w={'100%'}>
            {/* panel for create routes */}
            {routeDetail != null && (
              <CreateEditRouteContainer
                isDemo={true}
                editMode={true}
                isGoing2Edit={isGoing2Edit}
                setIsGoing2Edit={setIsGoing2Edit}
                // updatePayload={updatePayload}
                selectedOptions={selectedOptions}
                routeDetail={routeDetail}
                // setUpdatePayload={setUpdatePayload}
                setSelectedOptions={setSelectedOptions}
                // setIsGoing2Update={setIsGoing2Update}
              />
            )}

            {/* location list panel */}
            {allLocation != null && (
              <LocationListContainer
                setSelectedOptions={setSelectedOptions}
                selectedOptions={selectedOptions}
                data={allLocation}
                isGoing2Edit={isGoing2Edit}
              />
            )}
          </Flex>
        </Panel>
      </ASALayout>
    </React.Fragment>
  )
}

export default EditRouteDetailPage

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.ENABLE_DEMO !== 'true') {
    return { notFound: true }
  }
  /* const data = [
    {
      name: 'sampleRoute01',
      description: 'for testing',
      routeOrder: [
        {
          locationID: '28c5b215-15f6-45c0-8476-6a8eb7a686b2-L-1695268447011',
          name: 'henry',
          displayName: 'Henry',
        },
        {
          locationID: '54b9c937-1ade-4659-9a52-4e8fed809974-L-1695268532512',
          name: 'jackie',
          displayName: 'Jackie',
        },
        {
          locationID: '55495d95-739a-474b-bc2f-a29fe3f94a50-L-1695268477478',
          name: 'max',
          displayName: 'Max',
        },
        {
          locationID: 'f86695b6-fc2a-4ecc-b2b3-5047e513aaca-L-1695268416461',
          name: 'office',
          displayName: 'Office',
        },
        {
          locationID: '28c5b215-15f6-45c0-8476-6a8eb7a686b2-L-1695268447011',
          name: 'henry',
          displayName: 'Henry',
        },
        {
          locationID: '54b9c937-1ade-4659-9a52-4e8fed809974-L-1695268532512',
          name: 'jackie',
          displayName: 'Jackie',
        },
        {
          locationID: 'f86695b6-fc2a-4ecc-b2b3-5047e513aaca-L-1695268416461',
          name: 'office',
          displayName: 'Office',
        },
        {
          locationID: '55495d95-739a-474b-bc2f-a29fe3f94a50-L-1695268477478',
          name: 'max',
          displayName: 'Max',
        },
        {
          locationID: '28c5b215-15f6-45c0-8476-6a8eb7a686b2-L-1695268447011',
          name: 'henry',
          displayName: 'Henry',
        },
      ],
    },
  ] */

  /* const locationData = [
    {
      createdBy: 'Max Mo',
      createdAt: '2023-09-21T03:53:36.462Z',
      updatedAt: '2023-09-22T07:42:15.653Z',
      updatedBy: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      updateCount: 0,
      userID: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      orgID: '15733c2e-f452-49db-9121-5ee8fb40bf82-ORG-1694968891286',
      locationID: 'f86695b6-fc2a-4ecc-b2b3-5047e513aaca-L-1695268416461',
      name: 'office',
      description: 'Mass Delivery Starting Point',
      geoData: {
        lat: 0,
        lng: 0,
        x: -16.8279381147,
        y: -4.66790656485,
        w: 0.836602899102,
        z: -0.547814583479,
      },
      displayName: 'Office',
      __v: 0,
    },
    {
      createdBy: 'Max Mo',
      createdAt: '2023-09-21T03:54:07.011Z',
      updatedAt: '2023-09-22T07:43:43.141Z',
      updatedBy: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      updateCount: 0,
      userID: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      orgID: '15733c2e-f452-49db-9121-5ee8fb40bf82-ORG-1694968891286',
      locationID: '28c5b215-15f6-45c0-8476-6a8eb7a686b2-L-1695268447011',
      name: 'henry',
      description: 'To Henry',
      geoData: {
        lat: 0,
        lng: 0,
        x: 1.25739394189,
        y: -0.360462428265,
        w: 0.541234131381,
        z: 0.840891125544,
      },
      displayName: 'Henry',
      __v: 0,
    },
    {
      createdBy: 'Max Mo',
      createdAt: '2023-09-21T03:54:37.478Z',
      updatedAt: '2023-09-21T03:54:37.478Z',
      updatedBy: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      updateCount: 0,
      userID: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      orgID: '15733c2e-f452-49db-9121-5ee8fb40bf82-ORG-1694968891286',
      locationID: '55495d95-739a-474b-bc2f-a29fe3f94a50-L-1695268477478',
      name: 'max',
      description: '',
      geoData: {
        lat: 0,
        lng: 0,
        x: 1.47100303721,
        y: -1.40945942079,
        w: -0.228834905445,
        z: 0.973470723625,
      },
      displayName: 'Max',
      __v: 0,
    },
    {
      createdBy: 'Max Mo',
      createdAt: '2023-09-21T03:55:32.512Z',
      updatedAt: '2023-09-21T03:55:32.512Z',
      updatedBy: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      updateCount: 0,
      userID: 'b0a2d0b6-74dc-4898-a7ba-f190be1eb580-U-1695266587019',
      orgID: '15733c2e-f452-49db-9121-5ee8fb40bf82-ORG-1694968891286',
      locationID: '54b9c937-1ade-4659-9a52-4e8fed809974-L-1695268532512',
      name: 'jackie',
      description: '',
      geoData: {
        lat: 0,
        lng: 0,
        x: 2.35886368452,
        y: -3.00588236418,
        w: 0.830220108777,
        z: -0.55744974665,
      },
      displayName: 'Jackie',
      __v: 0,
    },
  ] */

  return {
    props: { success: true, data: [], locations: [], auth: true },
  }
}
