// Hard setup failure: the caller prints the message plus detail lines and exits 1.
export class SetupFailure extends Error {
  constructor(
    message: string,
    public readonly detailLines: readonly string[] = []
  ) {
    super(message)
  }
}
