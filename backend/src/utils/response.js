/** Every successful response has the same envelope. */
export const ok = (res, data, message = "Success", meta = undefined) =>
  res.status(200).json({ success: true, message, data, ...(meta && { meta }) });

export const created = (res, data, message = "Created successfully") =>
  res.status(201).json({ success: true, message, data });

export const noContent = (res) => res.status(204).send();

/**
 * Builds pagination metadata from query params.
 * @returns {{ page:number, limit:number, skip:number }}
 */
export const paginate = (query, defaultLimit = 25, maxLimit = 200) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const pageMeta = (total, page, limit) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});
