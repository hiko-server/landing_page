export default function is_serverSide() {
    return typeof window === undefined;
}