import { DateTime } from 'luxon';

export const getISOLocalTime = () => {
    return DateTime.local().toISO();
    //   return DateTime.local({ zone: 'Asia/Hong_Kong' }).toISO();
};

export const getISODate = () => {
    return DateTime.utc().toISODate();
    //   return DateTime.local({ zone: 'Asia/Hong_Kong' }).toISO();
};

export const getISOTime = () => {
    const utcDateTime = DateTime.utc();
    const isoString = utcDateTime.toISO?.();

    return isoString?.toString();
};

export const getISOSeconds = () => {
    return DateTime.utc().toSeconds();
};

export const getUnixTime = () => {
    return DateTime.now().toUnixInteger();
};

export const getEpochTime = () => {
    return DateTime.now().toMillis();
};
