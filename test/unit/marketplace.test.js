const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

let NftMarketplace, randomIpfsNft, deployer, marketplaceUser1, vrfCoordinatorV2Mock

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("NFT Marketplace Unit Tests", function () {
          beforeEach(async () => {
              // get fixtures with deployer account for vrfCoordinatorV2Mock and ipfsNft
              accounts = await ethers.getSigners()
              deployer = accounts[0]
              marketplaceUser1 = accounts[1]
              await deployments.fixture(["mocks", "nftmarketplace", "randomipfs"])
              randomIpfsNft = await ethers.getContract("IpfsNft")
              NftMarketplace = await ethers.getContract("NftMarketplace")
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
          })
          describe("List Item", async () => {
              beforeEach(async () => {
                  await mintNft()
              })
              it("reverts if price is 0", async () => {
                  await expect(
                      NftMarketplace.listItem(randomIpfsNft.address, "0", "0")
                  ).to.be.revertedWithCustomError(
                      NftMarketplace,
                      "NftMarketplace__PriceMustBeAboveZero"
                  )
              })
              it("reverts if NFT is not approved by the marketplace", async () => {
                  let price = ethers.utils.parseEther("0.1")
                  await expect(
                      NftMarketplace.listItem(randomIpfsNft.address, "0", price)
                  ).to.be.revertedWithCustomError(
                      NftMarketplace,
                      "NftMarketplace__NotApprovedForMarketplace"
                  )
              })
              it("item is listed and ItemListed is fired", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")
                  const listNftResponse = await NftMarketplace.listItem(
                      randomIpfsNft.address,
                      "0",
                      price
                  )
                  const listNftReceipt = await listNftResponse.wait(1)
                  assert.equal(listNftReceipt.events[0].event, "ItemListed")
              })
              it("reverts if NFT is already listed", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")
                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  await expect(
                      NftMarketplace.listItem(randomIpfsNft.address, "0", price)
                  ).to.be.revertedWithCustomError(NftMarketplace, "NftMarketplace__AlreadyListed")
              })
          })
          describe("Buy Item", async () => {
              beforeEach(async () => {
                  await mintNft()
              })
              it("reverts if NFT is not listed", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")

                  const playerConnectedNftMarketplace = NftMarketplace.connect(marketplaceUser1)
                  await expect(
                      playerConnectedNftMarketplace.buyItem(randomIpfsNft.address, "0", {
                          value: price,
                      })
                  ).to.be.revertedWithCustomError(NftMarketplace, "NftMarketplace__NotListed")
              })
              it("reverts if not enough ETH is sent", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")

                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  const playerConnectedNftMarketplace = NftMarketplace.connect(marketplaceUser1)
                  await expect(
                      playerConnectedNftMarketplace.buyItem(randomIpfsNft.address, "0", {
                          value: "0",
                      })
                  ).to.be.revertedWithCustomError(NftMarketplace, "NftMarketplace__PriceNotMet")
              })
              it("buy item, transfer proceeds to seller, emit event", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")
                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  const playerConnectedNftMarketplace = NftMarketplace.connect(marketplaceUser1)
                  const buyItemResponse = await playerConnectedNftMarketplace.buyItem(
                      randomIpfsNft.address,
                      "0",
                      { value: price }
                  )
                  const buyItemReceipt = await buyItemResponse.wait(1)

                  const proceeds = await NftMarketplace.getProceeds(deployer.address)
                  assert.equal(proceeds.toString(), price.toString())

                  // TO-DO: confirm seller proceeds were added
                  assert.equal(buyItemReceipt.events[1].event, "ItemBought")
              })
          })
          describe("Cancel Listing", async () => {
              beforeEach(async () => {
                  await mintNft()
              })

              it("reverts if there is no listing", async () => {
                  await expect(
                      NftMarketplace.cancelListing(randomIpfsNft.address, "0")
                  ).to.be.revertedWithCustomError(NftMarketplace, "NftMarketplace__NotListed")
              })
              it("cancel listing, emit event", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")
                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  const cancelListingResponse = await NftMarketplace.cancelListing(
                      randomIpfsNft.address,
                      "0"
                  )

                  const cancelListingReceipt = await cancelListingResponse.wait(1)
                  assert.equal(cancelListingReceipt.events[0].event, "ItemCanceled")
              })
          })
          describe("Update Listing", async () => {
              beforeEach(async () => {
                  await mintNft()
              })

              it("reverts if price is 0", async () => {
                  let price = ethers.utils.parseEther("0.1")
                  let newPrice = ethers.utils.parseEther("0")
                  await randomIpfsNft.approve(NftMarketplace.address, "0")

                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  await expect(
                      NftMarketplace.updateListing(randomIpfsNft.address, "0", newPrice)
                  ).to.be.revertedWithCustomError(
                      NftMarketplace,
                      "NftMarketplace__PriceMustBeAboveZero"
                  )
              })
              it("updates listing, emits event", async () => {
                  let price = ethers.utils.parseEther("0.1")
                  let newPrice = ethers.utils.parseEther("0.2")
                  await randomIpfsNft.approve(NftMarketplace.address, "0")

                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  const res = await NftMarketplace.updateListing(
                      randomIpfsNft.address,
                      "0",
                      newPrice
                  )
                  const receipt = await res.wait(1)

                  assert.equal(receipt.events[0].event, "ListingUpdated")
                  assert.equal(receipt.events[0].args.newPrice.toString(), newPrice)
              })
          })
          describe("Withdraw Proceeds", async () => {
              beforeEach(async () => {
                  await mintNft()
              })

              it("reverts if proceeds are 0", async () => {
                  await expect(NftMarketplace.withdrawProceeds()).to.be.revertedWithCustomError(
                      NftMarketplace,
                      "NftMarketplace__NoProceeds"
                  )
              })

              it("withdraw proceeds", async () => {
                  await randomIpfsNft.approve(NftMarketplace.address, "0")
                  let price = ethers.utils.parseEther("0.1")
                  await NftMarketplace.listItem(randomIpfsNft.address, "0", price)

                  const playerConnectedNftMarketplace = NftMarketplace.connect(marketplaceUser1)
                  await playerConnectedNftMarketplace.buyItem(randomIpfsNft.address, "0", {
                      value: price,
                  })

                  const proceedsBeforeWithdrawal = await NftMarketplace.getProceeds(
                      deployer.address
                  )
                  assert.equal(proceedsBeforeWithdrawal.toString(), price.toString())

                  await NftMarketplace.withdrawProceeds()

                  const proceedsAfterWithdrawal = await NftMarketplace.getProceeds(deployer.address)
                  assert.equal(proceedsAfterWithdrawal.toString(), 0)
              })
          })
      })

const mintNft = async () => {
    const mintFee = await randomIpfsNft.getMintFee()
    const requestNftResponse = await randomIpfsNft.requestNft({
        value: mintFee,
    })
    const requestNftReceipt = await requestNftResponse.wait(1)
    await vrfCoordinatorV2Mock.fulfillRandomWords(
        requestNftReceipt.events[1].args.requestId,
        randomIpfsNft.address
    )
}
