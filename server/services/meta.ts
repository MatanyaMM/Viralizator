const GRAPH_API_BASE = 'https://graph.facebook.com/v22.0';

interface ContainerResponse {
  id: string;
}

interface StatusResponse {
  status_code: string;
}

interface PublishResponse {
  id: string;
}

/**
 * Create a child container for a single carousel image.
 */
export async function createChildContainer(
  igUserId: string,
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const params = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: accessToken,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${igUserId}/media?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meta child container creation failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ContainerResponse;
  return data.id;
}

/**
 * Poll container status until FINISHED or ERROR.
 */
export async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  maxWaitMs = 60000,
  pollIntervalMs = 5000
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const response = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta status poll failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as StatusResponse;

    if (data.status_code === 'FINISHED') return 'FINISHED';
    if (data.status_code === 'ERROR') throw new Error(`Container ${containerId} status: ERROR`);
    if (data.status_code === 'EXPIRED') throw new Error(`Container ${containerId} status: EXPIRED`);

    // Still IN_PROGRESS — wait and retry
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Container ${containerId} polling timed out after ${maxWaitMs}ms`);
}

/**
 * Create a parent carousel container with child IDs.
 */
export async function createCarouselContainer(
  igUserId: string,
  accessToken: string,
  childContainerIds: string[],
  caption: string
): Promise<string> {
  const params = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: childContainerIds.join(','),
    caption,
    access_token: accessToken,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${igUserId}/media?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meta carousel container creation failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ContainerResponse;
  return data.id;
}

/**
 * Publish a carousel container.
 */
export async function publishContainer(
  igUserId: string,
  accessToken: string,
  creationId: string
): Promise<string> {
  const params = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
  });

  const response = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meta publish failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as PublishResponse;
  return data.id;
}

/**
 * Full carousel publishing flow: child containers → poll → parent → poll → publish.
 */
export async function publishCarousel(
  igUserId: string,
  accessToken: string,
  imageUrls: string[],
  caption: string
): Promise<{ publishedMediaId: string; childContainerIds: string[]; parentContainerId: string }> {
  if (imageUrls.length < 2) throw new Error('Carousel requires at least 2 images');
  if (imageUrls.length > 10) throw new Error('Carousel supports max 10 images');

  // Step 1: Create child containers
  const childContainerIds: string[] = [];
  for (const url of imageUrls) {
    const id = await createChildContainer(igUserId, accessToken, url);
    childContainerIds.push(id);
  }

  // Step 2: Poll each child container
  for (const id of childContainerIds) {
    await pollContainerStatus(id, accessToken);
  }

  // Step 3: Create parent carousel container
  const parentContainerId = await createCarouselContainer(
    igUserId,
    accessToken,
    childContainerIds,
    caption
  );

  // Step 4: Poll parent container
  await pollContainerStatus(parentContainerId, accessToken);

  // Step 5: Publish
  const publishedMediaId = await publishContainer(igUserId, accessToken, parentContainerId);

  return { publishedMediaId, childContainerIds, parentContainerId };
}
