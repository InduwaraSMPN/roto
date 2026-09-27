import { Button } from "@roto-app/ui/components/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@roto-app/ui/components/field";
import { Input } from "@roto-app/ui/components/input";
import { Spinner } from "@roto-app/ui/components/spinner";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

const fields = [
  { name: "name", label: "Name", type: "text", autoComplete: "name", hint: "Shown on the monthly leaderboard." },
  { name: "email", label: "Email", type: "email", autoComplete: "email", hint: undefined },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
] as const;

export default function SignUpForm() {
  const router = useRouter();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
        },
        {
          onSuccess: () => {
            router.push("/dashboard");
            toast.success("Account created");
          },
          onError: (error) => {
            toast.error(error.error.message || "Couldn't create the account. Try again in a moment.");
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Names are at least 2 characters"),
        email: z.email("Enter an email address like name@example.com"),
        password: z.string().min(8, "Use at least 8 characters"),
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
        {fields.map((f) => (
          <form.Field key={f.name} name={f.name}>
            {(field) => {
              const invalid = field.state.meta.errors.length > 0 || undefined;
              return (
                <Field data-invalid={invalid}>
                  <FieldLabel htmlFor={`sign-up-${f.name}`}>{f.label}</FieldLabel>
                  <Input
                    id={`sign-up-${f.name}`}
                    name={field.name}
                    type={f.type}
                    autoComplete={f.autoComplete}
                    className="h-10"
                    aria-invalid={invalid}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {f.hint && !invalid && <FieldDescription>{f.hint}</FieldDescription>}
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              );
            }}
          </form.Field>
        ))}

        <form.Subscribe
          selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button type="submit" size="lg" className="h-11 w-full text-base font-bold" disabled={!canSubmit || isSubmitting}>
              {isSubmitting && <Spinner />}
              {isSubmitting ? "Creating account" : "Create account"}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
}
