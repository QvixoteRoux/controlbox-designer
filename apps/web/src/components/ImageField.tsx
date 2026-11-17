import { Button, FileButton, Group, Image, Stack, Text } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { imageUrl } from "../lib/api";

/** File types the API accepts (it checks the real content too). */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

interface Props {
  /** The stored image, if any. */
  imagePath: string | null;
  /** A picked file not uploaded yet (new items upload after they're created). */
  pending?: File | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  busy?: boolean;
  disabled?: boolean;
}

/** Picture of a catalog item: preview, choose a file, remove. PNG, JPEG or WebP. */
export function ImageField({ imagePath, pending, onPick, onRemove, busy, disabled }: Props) {
  // Preview a picked file before it's uploaded; free the object URL when it changes.
  const pendingUrl = useMemo(() => (pending ? URL.createObjectURL(pending) : null), [pending]);
  useEffect(
    () => () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    },
    [pendingUrl],
  );
  const src = pendingUrl ?? (imagePath ? imageUrl(imagePath) : null);
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Picture
      </Text>
      <Group align="flex-start">
        {src ? (
          <Image
            src={src}
            alt=""
            w={96}
            h={96}
            fit="contain"
            radius="sm"
            bd="1px solid var(--mantine-color-default-border)"
          />
        ) : (
          <Text size="xs" c="dimmed" w={96}>
            No picture
          </Text>
        )}
        <Stack gap={4}>
          <FileButton onChange={(f) => f && onPick(f)} accept={IMAGE_ACCEPT}>
            {(props) => (
              <Button size="xs" variant="light" loading={busy} disabled={disabled} {...props}>
                {src ? "Replace" : "Choose file"}
              </Button>
            )}
          </FileButton>
          {src && (
            <Button size="xs" variant="subtle" color="red" disabled={disabled} onClick={onRemove}>
              Remove
            </Button>
          )}
          <Text size="xs" c="dimmed">
            PNG, JPEG or WebP
          </Text>
        </Stack>
      </Group>
    </Stack>
  );
}

/** A small thumbnail for tables. */
export function Thumbnail({ imagePath }: { imagePath: string | null }) {
  if (!imagePath) return null;
  return <Image src={imageUrl(imagePath)} alt="" w={40} h={40} fit="contain" radius="sm" />;
}
