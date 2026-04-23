import { Box } from "@chakra-ui/react";
import { useState, HTMLAttributes } from "react";

interface AnimatedBoxProps extends HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    isVisible?: boolean;
}

const AnimatedBox = ({
    children,
    isVisible = true,
    ...rest
}: AnimatedBoxProps) => {
    const [isRendered, setIsRendered] = useState(false);

    React.useEffect(() => {
        if (isVisible) {
            setTimeout(() => {
                setIsRendered(true);
            }, 100);
        } else {
            setIsRendered(false);
        }
    }, [isVisible]);

    return (
        <Box
            opacity={isRendered ? 1 : 0}
            transform={isRendered ? 'translateY(0)' : 'translateY(20px)'}
            transition="opacity 0.7s, transform 0.9s"
            {...rest}
        >
            {children}
        </Box>
    );
};

export default AnimatedBox;