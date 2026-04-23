
const DebounceInput = ({
  value: initialValue,
  onChange,
  debounceTimeout,
  ...props
}: {
  value: string | number
  onChange: (value: string | number) => void
  debounceTimeout?: number
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) => {
  const [value, setValue] = React.useState(initialValue)
  const debounce = debounceTimeout == undefined ? 500 : debounceTimeout

  React.useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)

    return () => clearTimeout(timeout)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  )
}

export default DebounceInput
