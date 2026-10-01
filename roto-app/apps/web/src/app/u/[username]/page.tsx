// Public rider page: public posts + badges, respecting visibility/hide-max-speed.
// ponytail: community.profile resolves by userId; the better-auth username column lands
// with the auth migration, so until username→userId resolution exists the slug is tried
// as a userId and anything else renders the fallback below.
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Award, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@roto-app/ui/components/alert";
import { Badge } from "@roto-app/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@roto-app/ui/components/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@roto-app/ui/components/item";
import { Skeleton } from "@roto-app/ui/components/skeleton";

import { futureQuery } from "@/lib/future";
import { tx, useLang } from "@/lib/lang";

import { dict } from "./_components/i18n";

type Post = {
  id: string;
  body: string;
  rideId?: string | null;
  routeId?: string | null;
  createdAt?: string | null;
};
type BadgeRow = { key?: string; badgeKey?: string; awardedAt?: string | null };
type Profile = { posts?: Post[] | null; badges?: BadgeRow[] | null };

export default function RiderPage() {
  const { username } = useParams<{ username: string }>();
  const { lang } = useLang();
  const t = (k: string) => tx(lang, { en: dict.en[k] ?? k, si: dict.si[k] ?? k, ta: dict.ta[k] ?? k });

  // community.profile is built but not wired into AppRouter yet; guarded until it lands.
  const profile = useQuery({
    queryKey: ["community-profile", username],
    queryFn: () => futureQuery<Profile>("community.profile", { userId: username }),
    retry: false,
  });
  const data = (profile.data ?? null) as Profile | null;
  const posts = data?.posts ?? [];
  const badges = data?.badges ?? [];

  if (profile.isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pt-10 pb-16 sm:px-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (profile.isError || !data || (posts.length === 0 && badges.length === 0)) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 pt-10 pb-16 sm:px-6">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t("missing")}</AlertTitle>
          <AlertDescription>{t("missingSub")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pt-10 pb-16 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{decodeURIComponent(username)}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Award className="size-5" />
            {t("badges")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {badges.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noBadges")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {badges.map((b, i) => (
                <li key={i}>
                  <Badge variant="secondary">{b.key ?? b.badgeKey ?? `badge-${i + 1}`}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">{t("publicRides")}</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRides")}</p>
          ) : (
            <ItemGroup className="-mx-3 gap-0 has-data-[size=sm]:gap-0">
              {posts.map((p) => (
                <Item key={p.id} size="sm" role="listitem">
                  <ItemContent>
                    <ItemTitle className="line-clamp-2 font-semibold">{p.body}</ItemTitle>
                    <ItemDescription>
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
