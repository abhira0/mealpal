import LoginForm from "./LoginForm";

export default function LoginPage() {
  const allowRegistration = process.env.ALLOW_REGISTRATION === "true";
  return <LoginForm allowRegistration={allowRegistration} />;
}
