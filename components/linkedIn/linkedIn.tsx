import { useEffect } from 'react'

const LinkedInBadge: React.FC = () => {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://platform.linkedin.com/badges/js/profile.js'
    script.async = true
    script.defer = true
    script.type = 'text/javascript'
    document.body.appendChild(script)
  }, [])

  return (
    <div
      className="badge-base LI-profile-badge"
      data-locale="en"
      data-size="large"
      data-theme="light"
      data-type="VERTICAL"
      data-vanity="liyanpeihiko"
      data-version="v1"
    ></div>
  )
}

export default LinkedInBadge
