"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { evaluateDraftPlatformRules, type CanonicalMediaType, type PlatformRuleIssue } from "@postport/platform-sdk";
import { Button, Card, CardDescription, CardTitle, Input } from "@postport/ui";
import { ApiError, apiRequest } from "@/lib/api-client";
import { getPlatformSupportNotes, type CapabilityFlags } from "@/lib/platform-support";

type Platform = "INSTAGRAM" | "FACEBOOK" | "TIKTOK";
type PublishMode = "DIRECT" | "DRAFT_UPLOAD";
type InstagramPostFormat = "FEED_POST" | "REEL";
type FacebookPostFormat = "PAGE_POST" | "REEL";
type SubmitIntent = "save" | "publish" | "schedule";

interface MediaItem {
  id: string;
  originalFilename: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL";
  status: string;
}

interface ConnectedProfile {
  id: string;
  name: string;
  isEligible: boolean;
  capabilityFlags?: CapabilityFlags | null;
  publishModeAvailable?: { direct?: boolean; draftUpload?: boolean } | null;
}

interface ConnectedAccount {
  id: string;
  platform: Platform;
  displayName: string;
  status: string;
  profiles: ConnectedProfile[];
}

const platforms: Platform[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK"];
const draftSchema = z.object({
  title: z.string().max(150).optional(),
  caption: z.string().max(2200).optional(),
  description: z.string().max(4000).optional(),
  hashtagsText: z.string().optional(),
  mentionsText: z.string().optional(),
  privacyLevel: z.string().optional(),
  disableComments: z.boolean().default(false),
  scheduledAt: z.string().optional()
});
type DraftForm = z.infer<typeof draftSchema>;

export default function CreateDraftPage() {
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = params.locale ?? "en";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [connections, setConnections] = useState<ConnectedAccount[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [platformAccountId, setPlatformAccountId] = useState<Partial<Record<Platform, string>>>({});
  const [platformProfileId, setPlatformProfileId] = useState<Partial<Record<Platform, string>>>({});
  const [tiktokMode, setTiktokMode] = useState<PublishMode>("DIRECT");
  const [instagramPostFormat, setInstagramPostFormat] = useState<InstagramPostFormat>("FEED_POST");
  const [facebookPostFormat, setFacebookPostFormat] = useState<FacebookPostFormat>("PAGE_POST");
  const [activeTab, setActiveTab] = useState<Platform>("INSTAGRAM");
  const [submitIntent, setSubmitIntent] = useState<SubmitIntent>("save");
  const [appliedPrefillKey, setAppliedPrefillKey] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<DraftForm>({
    resolver: zodResolver(draftSchema),
    defaultValues: { disableComments: false, privacyLevel: "SELF_ONLY" }
  });

  const values = watch();
  const requestedMediaIds = useMemo(() => {
    const value = searchParams.get("media");
    if (!value) {
      return [];
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }, [searchParams]);
  const requestedMediaKey = requestedMediaIds.join(",");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [mediaResponse, connectionsResponse] = await Promise.all([
          apiRequest<{ items: MediaItem[] }>("/media?status=READY"),
          apiRequest<{ items: ConnectedAccount[] }>("/connections")
        ]);
        setMedia(mediaResponse.items);
        setConnections(connectionsResponse.items);
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "Unable to load composer data.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (loading || appliedPrefillKey === requestedMediaKey) {
      return;
    }

    setAppliedPrefillKey(requestedMediaKey);
    if (requestedMediaIds.length === 0) {
      return;
    }

    const restoredIds = requestedMediaIds.filter((id) => media.some((item) => item.id === id));
    if (restoredIds.length > 0) {
      setSelectedMediaIds(restoredIds);
    }

    if (restoredIds.length === requestedMediaIds.length) {
      setSelectionNotice(`Added ${restoredIds.length} media asset(s) from Media Library.`);
      return;
    }

    if (restoredIds.length > 0) {
      setSelectionNotice(`Added ${restoredIds.length} READY media asset(s). Some selected files are still unavailable.`);
      return;
    }

    setSelectionNotice("No READY media from the library could be attached yet. Upload processing may still be running.");
  }, [appliedPrefillKey, loading, media, requestedMediaIds, requestedMediaKey]);

  const connectionsByPlatform = useMemo(() => {
    const grouped: Record<Platform, ConnectedAccount[]> = { INSTAGRAM: [], FACEBOOK: [], TIKTOK: [] };
    for (const connection of connections) {
      if (connection.status === "ACTIVE") {
        grouped[connection.platform].push(connection);
      }
    }
    return grouped;
  }, [connections]);

  const selectedMedia = useMemo(
    () => selectedMediaIds.map((id) => media.find((item) => item.id === id)).filter(Boolean) as MediaItem[],
    [media, selectedMediaIds]
  );
  const mediaLibraryHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("returnTo", `/${locale}/drafts/new`);
    if (selectedMediaIds.length > 0) {
      params.set("selected", selectedMediaIds.join(","));
    }
    return `/${locale}/media?${params.toString()}`;
  }, [locale, selectedMediaIds]);

  const selectedAccountForPlatform = useMemo(() => {
    const result: Partial<Record<Platform, ConnectedAccount | null>> = {};
    for (const platform of platforms) {
      const selectedId = platformAccountId[platform];
      result[platform] = selectedId
        ? connectionsByPlatform[platform].find((item) => item.id === selectedId) ?? null
        : connectionsByPlatform[platform][0] ?? null;
    }
    return result;
  }, [connectionsByPlatform, platformAccountId]);

  const selectedProfileForPlatform = useMemo(() => {
    const result: Partial<Record<Platform, ConnectedProfile | null>> = {};
    for (const platform of platforms) {
      const account = selectedAccountForPlatform[platform];
      result[platform] = platformProfileId[platform]
        ? account?.profiles.find((profile) => profile.id === platformProfileId[platform]) ?? null
        : account?.profiles[0] ?? null;
    }
    return result;
  }, [platformProfileId, selectedAccountForPlatform]);

  useEffect(() => {
    if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(activeTab)) {
      setActiveTab(selectedPlatforms[0] ?? "INSTAGRAM");
    }
  }, [activeTab, selectedPlatforms]);

  const tiktokProfile = selectedProfileForPlatform.TIKTOK ?? null;
  const tiktokAvailability = tiktokProfile?.publishModeAvailable ?? { direct: true, draftUpload: true };
  const tiktokPrivacyOptions = tiktokProfile?.capabilityFlags?.supportedPrivacyLevels ?? ["SELF_ONLY"];
  useEffect(() => {
    if (tiktokMode === "DIRECT" && !tiktokAvailability.direct && tiktokAvailability.draftUpload) {
      setTiktokMode("DRAFT_UPLOAD");
    }
    if (tiktokMode === "DRAFT_UPLOAD" && !tiktokAvailability.draftUpload && tiktokAvailability.direct) {
      setTiktokMode("DIRECT");
    }
  }, [tiktokAvailability.direct, tiktokAvailability.draftUpload, tiktokMode]);

  const preflight = useMemo(() => {
    const issues: PlatformRuleIssue[] = [];
    const saveBlocking: string[] = [];
    const publishBlocking: string[] = [];
    const mediaType: CanonicalMediaType =
      selectedMediaIds.length > 1 ? "CAROUSEL" : selectedMedia[0]?.mediaType === "VIDEO" ? "VIDEO" : "IMAGE";

    if (selectedMediaIds.length === 0) saveBlocking.push("Select at least one media asset.");
    if (selectedPlatforms.length === 0) saveBlocking.push("Select at least one platform.");
    if (submitIntent === "schedule" && !values.scheduledAt) {
      publishBlocking.push("Choose a schedule date and time before queueing a scheduled draft.");
    }

    for (const platform of selectedPlatforms) {
      const account = selectedAccountForPlatform[platform];
      const profile = selectedProfileForPlatform[platform];
      const availableProfiles = account?.profiles ?? [];
      if (!account) {
        publishBlocking.push(`Connect an active ${platform.toLowerCase()} account before publishing.`);
        continue;
      }
      if (availableProfiles.length === 0) {
        publishBlocking.push(
          platform === "FACEBOOK"
            ? "No Facebook Page targets were found for the selected connection. Refresh metadata or reconnect with Page access."
            : `No ${platform.toLowerCase()} targets were available for the selected connection. Refresh metadata and try again.`
        );
        continue;
      }
      if (!profile) {
        publishBlocking.push(`Choose a publish target for ${platform.toLowerCase()}.`);
        continue;
      }
      if (!profile.isEligible) {
        publishBlocking.push(`${platform} target is not currently eligible for publishing.`);
      }
      issues.push(
        ...evaluateDraftPlatformRules({
          platform,
          mediaType,
          mediaCount: selectedMediaIds.length,
          publishMode: platform === "TIKTOK" ? tiktokMode : "DIRECT",
          capabilities: profile.capabilityFlags ?? null,
          canonicalPost: {
            privacyLevel: platform === "TIKTOK" ? values.privacyLevel ?? null : null,
            disableComments: platform === "TIKTOK" ? values.disableComments : false,
            platformSpecificJson:
              platform === "INSTAGRAM"
                ? { postFormat: instagramPostFormat }
                : platform === "FACEBOOK"
                  ? { postFormat: facebookPostFormat }
                  : undefined
          },
          publishedPostsIn24Hours: 0
        })
      );
    }

    const issueErrors = issues.filter((item) => item.severity === "error").map((item) => item.message);
    const allErrors = [...saveBlocking, ...publishBlocking, ...issueErrors];

    return {
      errors: allErrors,
      blockingErrors: submitIntent === "save" ? saveBlocking : allErrors,
      warnings: issues.filter((item) => item.severity === "warning").map((item) => item.message)
    };
  }, [
    facebookPostFormat,
    instagramPostFormat,
    selectedAccountForPlatform,
    selectedMedia,
    selectedMediaIds,
    selectedPlatforms,
    selectedProfileForPlatform,
    submitIntent,
    tiktokMode,
    values.disableComments,
    values.privacyLevel,
    values.scheduledAt
  ]);

  const toggleMedia = (mediaId: string) => {
    setSelectedMediaIds((previous) =>
      previous.includes(mediaId) ? previous.filter((item) => item !== mediaId) : [...previous, mediaId]
    );
  };

  const moveToCover = (mediaId: string) => {
    setSelectedMediaIds((previous) => [mediaId, ...previous.filter((item) => item !== mediaId)]);
  };

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((previous) => {
      const next = previous.includes(platform) ? previous.filter((item) => item !== platform) : [...previous, platform];
      if (next.length > 0 && !next.includes(activeTab)) setActiveTab(next[0] ?? "INSTAGRAM");
      if (next.includes(platform)) setActiveTab(platform);
      return next;
    });
  };

  const onSubmit = async (form: DraftForm) => {
    setError(null);
    if (preflight.blockingErrors.length > 0) {
      setError("Resolve the highlighted validation issues before continuing.");
      return;
    }

    const payload = {
      title: form.title,
      caption: form.caption,
      description: form.description,
      hashtags: splitListValue(form.hashtagsText),
      mentions: splitListValue(form.mentionsText),
      privacyLevel: selectedPlatforms.includes("TIKTOK") ? form.privacyLevel || undefined : undefined,
      disableComments: selectedPlatforms.includes("TIKTOK") ? form.disableComments : undefined,
      mediaAssetIds: selectedMediaIds,
      platforms: selectedPlatforms.map((platform) => ({
        platform,
        connectedAccountId: selectedAccountForPlatform[platform]?.id,
        connectedPageOrProfileId: selectedProfileForPlatform[platform]?.id,
        publishMode: platform === "TIKTOK" ? tiktokMode : "DIRECT",
        platformSpecificJson:
          platform === "INSTAGRAM"
            ? { postFormat: instagramPostFormat }
            : platform === "FACEBOOK"
              ? { postFormat: facebookPostFormat }
              : undefined
      })),
      scheduledAt: submitIntent === "schedule" && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    try {
      const draft = await apiRequest<{ id: string }>("/drafts", { method: "POST", body: JSON.stringify(payload) });
      if (submitIntent === "publish") {
        await apiRequest(`/drafts/${draft.id}/publish-now`, { method: "POST" });
        router.push(`/${locale}/history`);
      } else if (submitIntent === "schedule") {
        router.push(`/${locale}/calendar`);
      } else {
        router.push(`/${locale}/drafts`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to create draft.");
    }
  };

  const activeAccount = selectedAccountForPlatform[activeTab] ?? null;
  const activeProfiles = activeAccount?.profiles ?? [];
  const activeProfile = selectedProfileForPlatform[activeTab] ?? null;
  const supportNotes = getPlatformSupportNotes(activeTab, activeProfile?.capabilityFlags);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-900 dark:text-white">Create Draft</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Capability-aware composer with direct publish and schedule actions.</p>
        </div>
        <Link href={`/${locale}/drafts`}>
          <Button variant="secondary">Back to drafts</Button>
        </Link>
      </div>

      {error ? (
        <Card className="border-rose-300">
          <CardTitle>Composer error</CardTitle>
          <CardDescription className="mt-2">{error}</CardDescription>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardDescription>Loading media and connection options...</CardDescription>
        </Card>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Shared content</CardTitle>
                    <CardDescription className="mt-1">Write once, then adjust target-specific options below.</CardDescription>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {(values.caption ?? "").length}/2200
                  </span>
                </div>
                <div className="space-y-2">
                  <label htmlFor="title" className="text-sm font-medium">Title</label>
                  <Input id="title" placeholder="Spring launch teaser" {...register("title")} />
                  {errors.title ? <p className="text-xs text-rose-600">{errors.title.message}</p> : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="caption" className="text-sm font-medium">Caption</label>
                  <textarea
                    id="caption"
                    rows={5}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    {...register("caption")}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">Description</label>
                  <textarea
                    id="description"
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                    {...register("description")}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="hashtagsText" className="text-sm font-medium">Hashtags</label>
                    <Input id="hashtagsText" placeholder="#launch, #springdrop" {...register("hashtagsText")} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="mentionsText" className="text-sm font-medium">Mentions</label>
                    <Input id="mentionsText" placeholder="@brand, @creator" {...register("mentionsText")} />
                  </div>
                </div>
              </Card>

              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Selected media</CardTitle>
                    <CardDescription className="mt-1">Choose assets here, or jump to Media Library and bring your selection back into this draft.</CardDescription>
                  </div>
                  <Link href={mediaLibraryHref}>
                    <Button variant="secondary" type="button">Open library</Button>
                  </Link>
                </div>
                {selectionNotice ? (
                  <div className="rounded-2xl border border-sky-300 bg-sky-50/80 p-3 text-sm text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/20 dark:text-sky-200">
                    {selectionNotice}
                  </div>
                ) : null}
                {media.length > 0 && selectedMediaIds.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                    No media attached yet. Tick one or more READY assets below, or pick them from Media Library and return here.
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {media.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      No READY media found yet. Upload or reprocess files in Media Library, then come back and attach them to this draft.
                    </div>
                  ) : (
                    media.map((item) => {
                      const selectedIndex = selectedMediaIds.indexOf(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`space-y-3 rounded-2xl border p-4 text-sm ${
                            selectedIndex >= 0
                              ? "border-sky-400 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/20"
                              : "border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium text-slate-900 dark:text-white">{item.originalFilename}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{item.mediaType} | {item.status}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedIndex >= 0}
                              onChange={() => toggleMedia(item.id)}
                              className="mt-1 h-4 w-4"
                            />
                          </div>
                          {selectedIndex >= 0 ? (
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white dark:bg-slate-100 dark:text-slate-900">
                                {selectedIndex === 0 ? "Cover" : `Order ${selectedIndex + 1}`}
                              </span>
                              {selectedIndex > 0 ? (
                                <Button variant="secondary" type="button" onClick={() => moveToCover(item.id)}>Set as cover</Button>
                              ) : null}
                            </div>
                          ) : null}
                        </label>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="space-y-4">
                <CardTitle>Publish plan</CardTitle>
                <CardDescription>Pick targets, then decide whether this draft publishes now or later.</CardDescription>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Platforms</p>
                  <div className="flex flex-wrap gap-2">
                    {platforms.map((platform) => (
                      <Button
                        key={platform}
                        type="button"
                        variant={selectedPlatforms.includes(platform) ? "default" : "secondary"}
                        onClick={() => togglePlatform(platform)}
                      >
                        {platform}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="scheduledAt" className="text-sm font-medium">Schedule time</label>
                  <Input id="scheduledAt" type="datetime-local" {...register("scheduledAt")} />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                  <p>Media selected: {selectedMediaIds.length}</p>
                  <p>Platforms selected: {selectedPlatforms.length}</p>
                  <p>Cover asset: {selectedMedia[0]?.originalFilename ?? "None selected"}</p>
                  <p>TikTok mode: {selectedPlatforms.includes("TIKTOK") ? tiktokMode : "Not selected"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" onClick={() => setSubmitIntent("save")} disabled={isSubmitting} data-testid="draft-save-button">
                    {isSubmitting && submitIntent === "save" ? "Saving..." : "Save draft"}
                  </Button>
                  <Button type="submit" variant="secondary" onClick={() => setSubmitIntent("schedule")} disabled={isSubmitting} data-testid="draft-schedule-button">
                    {isSubmitting && submitIntent === "schedule" ? "Scheduling..." : "Save and schedule"}
                  </Button>
                  <Button type="submit" variant="secondary" onClick={() => setSubmitIntent("publish")} disabled={isSubmitting} data-testid="draft-publish-now-button">
                    {isSubmitting && submitIntent === "publish" ? "Queueing..." : "Publish now"}
                  </Button>
                </div>
              </Card>

              <Card className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Validation</CardTitle>
                    <CardDescription className="mt-1">Preflight checks use the same platform rule engine as the backend.</CardDescription>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {preflight.errors.length === 0 ? "Ready" : `${preflight.errors.length} issue(s)`}
                  </span>
                </div>
                {preflight.errors.length === 0 && preflight.warnings.length === 0 ? (
                  <CardDescription>No validation issues so far.</CardDescription>
                ) : (
                  <div className="space-y-3">
                    {preflight.errors.map((message) => (
                      <div key={message} className="rounded-2xl border border-rose-300 bg-rose-50/80 p-3 text-sm text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/20 dark:text-rose-200">
                        {message}
                      </div>
                    ))}
                    {preflight.warnings.map((message) => (
                      <div key={message} className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3 text-sm text-amber-700 dark:border-amber-900/80 dark:bg-amber-950/20 dark:text-amber-200">
                        {message}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          <Card className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Platform tabs</CardTitle>
                <CardDescription className="mt-1">Only supported controls stay editable for the active platform.</CardDescription>
              </div>
              {selectedPlatforms.length === 0 ? <span className="text-sm text-slate-500 dark:text-slate-400">Select a platform to configure target details.</span> : null}
            </div>

            {selectedPlatforms.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {selectedPlatforms.map((platform) => (
                    <Button key={platform} type="button" variant={activeTab === platform ? "default" : "secondary"} onClick={() => setActiveTab(platform)}>
                      {platform}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                  <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Connected account
                        </label>
                        <select
                          aria-label={`${activeTab.toLowerCase()} connected account`}
                          value={platformAccountId[activeTab] ?? ""}
                          onChange={(event) => setPlatformAccountId((previous) => ({ ...previous, [activeTab]: event.target.value }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="">Use default connected target</option>
                          {connectionsByPlatform[activeTab].map((account) => (
                            <option key={account.id} value={account.id}>{account.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Publish target
                        </label>
                        <select
                          aria-label={`${activeTab.toLowerCase()} publish target`}
                          value={platformProfileId[activeTab] ?? activeProfile?.id ?? ""}
                          onChange={(event) => setPlatformProfileId((previous) => ({ ...previous, [activeTab]: event.target.value }))}
                          disabled={activeProfiles.length === 0}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:border-dashed disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:disabled:text-slate-500"
                        >
                          {activeProfiles.length === 0 ? (
                            <option value="">No page/profile targets available</option>
                          ) : (
                            <option value="">Auto-select first available page/profile</option>
                          )}
                          {activeProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>{profile.name}{profile.isEligible ? "" : " (ineligible)"}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {activeTab === "TIKTOK" ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <select
                            value={tiktokMode}
                            onChange={(event) => setTiktokMode(event.target.value as PublishMode)}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                          >
                            <option value="DIRECT" disabled={!tiktokAvailability.direct}>TikTok Direct Post</option>
                            <option value="DRAFT_UPLOAD" disabled={!tiktokAvailability.draftUpload}>TikTok Upload as Draft</option>
                          </select>
                          <select
                            {...register("privacyLevel")}
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                          >
                            {tiktokPrivacyOptions.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700">
                          <input type="checkbox" className="h-4 w-4" {...register("disableComments")} />
                          Disable comments on TikTok
                        </label>
                      </>
                    ) : activeTab === "INSTAGRAM" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={instagramPostFormat}
                          onChange={(event) => setInstagramPostFormat(event.target.value as InstagramPostFormat)}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="FEED_POST">Instagram Feed Post</option>
                          <option value="REEL">Instagram Reel</option>
                        </select>
                        <div className="flex items-center rounded-xl border border-dashed border-slate-200 px-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Stories are intentionally disabled in this product.
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={facebookPostFormat}
                          onChange={(event) => setFacebookPostFormat(event.target.value as FacebookPostFormat)}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="PAGE_POST">Facebook Page Post</option>
                          <option value="REEL">Facebook Reel</option>
                        </select>
                        <div className="flex items-center rounded-xl border border-dashed border-slate-200 px-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Personal profile publishing is not supported.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/70">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Platform notes</p>
                    {connectionsByPlatform[activeTab].length === 0 ? (
                      <p className="text-sm text-amber-700 dark:text-amber-200">No active connection found yet. Saving is allowed, but publish actions remain blocked until a target is connected.</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {supportNotes.map((note) => (
                        <span key={note} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm dark:bg-slate-950 dark:text-slate-300">
                          {note}
                        </span>
                      ))}
                    </div>
                    {activeProfile ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200">
                        <p>Target: {activeProfile.name}</p>
                        <p>Eligible: {activeProfile.isEligible ? "Yes" : "No"}</p>
                        <p>Modes: {JSON.stringify(activeProfile.publishModeAvailable ?? { direct: true, draftUpload: false })}</p>
                      </div>
                    ) : activeAccount && activeProfiles.length === 0 ? (
                      <p className="text-sm text-amber-700 dark:text-amber-200">
                        This connection does not currently expose any page/profile targets. Refresh metadata from Connections or reconnect and grant target access.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Choose a connected target to view capability details.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <CardDescription>Select at least one platform to unlock target settings.</CardDescription>
            )}
          </Card>
        </form>
      )}
    </div>
  );
}

function splitListValue(value: string | undefined) {
  if (!value) return [];
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}
