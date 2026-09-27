import { Button } from "@roto-app/ui/components/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@roto-app/ui/components/field";
import { Input } from "@roto-app/ui/components/input";
import { Spinner } from "@roto-app/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

export default function SignInForm() {
  const router = useRouter();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success("Signed in");
          },
          onError: (error) => {
            toast.error(error.error.message || "Sign-in failed. Check your email and password.");
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter an email address like name@example.com"),
        password: z.string().min(8, "Passwords are at least 8 characters"),
      }),
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-5">
        <form.Field name="email">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
              <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
              <Input
                id="sign-in-email"
                name={field.name}
                type="email"
                autoComplete="email"
                className="h-10"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
              <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
              <Input
                id="sign-in-password"
                name={field.name}
                type="password"
                autoComplete="current-password"
                className="h-10"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button type="submit" size="lg" className="h-11 w-full text-base font-bold" disabled={!canSubmit || isSubmitting}>
              {isSubmitting && <Spinner />}
              {isSubmitting ? "Signing in" : "Sign in"}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
}
