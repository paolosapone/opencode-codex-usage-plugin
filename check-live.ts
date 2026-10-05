import { fetchUsage, readCredentials, UsageError } from "./usage"
import { details } from "./display"

try {
  const snapshot = await fetchUsage(await readCredentials(), AbortSignal.timeout(10000))
  console.log(details({ snapshot, loading: false }))
} catch (error) {
  console.error(error instanceof UsageError ? error.message : "Verifica quota non riuscita.")
  process.exitCode = 1
}
