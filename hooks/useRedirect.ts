import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function useRedirect(redirect?: string) {
  const router = useRouter();
  useEffect(() => {
    if (redirect) {
      router.replace(redirect);
    }
  }, []);
}
