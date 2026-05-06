import { useTheme } from 'react-admin';

export const useJsonTheme = () => {
    const [theme] = useTheme();
    return theme === 'dark' ? "monokai" : 'rjv-default';
};
